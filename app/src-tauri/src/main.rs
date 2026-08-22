use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const TRAY_ICON_RGBA: &[u8] = include_bytes!("../icons/tray-template.rgba");
const PROTECTED_PLUGIN_IDS: &[&str] = &[
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app",
    "@deepseek-ai/dsh-market",
    "@deepseek-ai/dsh-supervisor-web",
    "dsh-base",
    "dsh-web-app",
    "dsh-market",
    "dsh-supervisor-web",
];

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct LaunchDescriptor {
    exec_path: String,
    args: Vec<String>,
    cwd: String,
    env: serde_json::Map<String, serde_json::Value>,
}

impl LaunchDescriptor {
    fn env_pairs(&self) -> Vec<(String, String)> {
        self.env
            .iter()
            .filter_map(|(key, value)| value.as_str().map(|text| (key.clone(), text.to_string())))
            .collect()
    }
}

struct SupervisorPaths {
    root: PathBuf,
    token_path: PathBuf,
    token: String,
}

fn dsh_home() -> PathBuf {
    if let Ok(value) = env::var("DSH_HOME") {
        if !value.trim().is_empty() {
            return PathBuf::from(value);
        }
    }
    let home = env::var("HOME")
        .or_else(|_| env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".dsh")
}

fn ensure_supervisor_paths() -> std::io::Result<SupervisorPaths> {
    let root = dsh_home().join("supervisor");
    fs::create_dir_all(&root)?;
    let token_path = root.join("token");
    if !token_path.exists() {
        fs::write(&token_path, format!("dev-token-{}", std::process::id()))?;
    }
    let token = fs::read_to_string(&token_path)?.trim().to_string();
    Ok(SupervisorPaths {
        root,
        token_path,
        token,
    })
}

fn respond(mut stream: TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\ncontent-type: application/json; charset=utf-8\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
}

fn authorized(request: &str, token: &str) -> bool {
    let expected = format!("bearer {token}");
    request.lines().skip(1).any(|line| {
        let Some((name, value)) = line.split_once(':') else {
            return false;
        };
        name.eq_ignore_ascii_case("authorization") && value.trim().eq_ignore_ascii_case(&expected)
    })
}

fn content_length(header: &str) -> usize {
    header
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            if name.eq_ignore_ascii_case("content-length") {
                value.trim().parse::<usize>().ok()
            } else {
                None
            }
        })
        .unwrap_or(0)
}

fn header_end_offset(bytes: &[u8]) -> Option<usize> {
    bytes
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| index + 4)
}

fn read_http_request(stream: &mut TcpStream) -> std::io::Result<String> {
    let mut raw = Vec::new();
    let mut buffer = [0_u8; 4096];
    let mut expected_total: Option<usize> = None;
    loop {
        let size = stream.read(&mut buffer)?;
        if size == 0 {
            break;
        }
        raw.extend_from_slice(&buffer[..size]);
        if expected_total.is_none() {
            if let Some(header_end) = header_end_offset(&raw) {
                let header = String::from_utf8_lossy(&raw[..header_end]);
                expected_total = Some(header_end + content_length(&header));
            }
        }
        if let Some(total) = expected_total {
            if raw.len() >= total {
                break;
            }
        }
        if raw.len() > 65_536 {
            return Err(supervisor_error("HTTP request is too large"));
        }
    }
    Ok(String::from_utf8_lossy(&raw).into_owned())
}

fn restart_dsh_web() -> std::io::Result<String> {
    let mut stream = TcpStream::connect("127.0.0.1:3080")?;
    let request = "POST /dsh-market/restart HTTP/1.1\r\nhost: 127.0.0.1:3080\r\norigin: http://127.0.0.1:3080\r\ncontent-length: 0\r\nconnection: close\r\n\r\n";
    stream.write_all(request.as_bytes())?;
    let mut response = String::new();
    stream.read_to_string(&mut response)?;
    let status = response.lines().next().unwrap_or_default();
    if status.contains(" 200 ") {
        Ok(response)
    } else {
        Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("DSH restart failed: {status}"),
        ))
    }
}

fn supervisor_error(message: impl Into<String>) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::Other, message.into())
}

fn read_launch_descriptor() -> std::io::Result<LaunchDescriptor> {
    let path = dsh_home().join("supervisor").join("launch.json");
    let text = fs::read_to_string(path)?;
    serde_json::from_str(&text)
        .map_err(|error| supervisor_error(format!("invalid launch descriptor: {error}")))
}

fn spawn_launch(launch: &LaunchDescriptor, args: &[String]) -> std::io::Result<()> {
    let mut command = Command::new(&launch.exec_path);
    command.args(args);
    command.current_dir(&launch.cwd);
    for (key, value) in launch.env_pairs() {
        command.env(key, value);
    }
    command.spawn()?;
    Ok(())
}

fn restart_from_launch_descriptor() -> std::io::Result<()> {
    let launch = read_launch_descriptor()?;
    spawn_launch(&launch, &launch.args)
}

fn disable_plugin_for_profile(
    profile: &str,
    plugin_id: &str,
    reason: Option<&str>,
) -> std::io::Result<()> {
    if plugin_id.trim().is_empty() || plugin_id.chars().any(|ch| ch.is_control()) {
        return Err(supervisor_error(
            "plugin id must be a non-empty printable string",
        ));
    }
    if PROTECTED_PLUGIN_IDS.contains(&plugin_id) {
        return Err(supervisor_error(format!(
            "refusing to disable protected DSH plugin {plugin_id}"
        )));
    }
    let patch_path = dsh_home()
        .join("profiles")
        .join(profile)
        .join("cordis.patch.yml");
    if let Some(parent) = patch_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let existing = fs::read_to_string(&patch_path).unwrap_or_default();
    let mut content = strip_empty_patch_document(&existing);
    if !content.ends_with('\n') && !content.is_empty() {
        content.push('\n');
    }
    content.push_str("\n# Disabled by DSH Desktop Supervisor recovery");
    if let Some(reason) = reason {
        let reason = reason.replace(['\r', '\n'], " ");
        if !reason.trim().is_empty() {
            content.push_str(": ");
            content.push_str(reason.trim());
        }
    }
    content.push_str("\n- id: ");
    content.push_str(
        &serde_json::to_string(plugin_id)
            .map_err(|error| supervisor_error(format!("failed to quote plugin id: {error}")))?,
    );
    content.push_str("\n  disabled: true\n");
    fs::write(patch_path, content)
}

fn strip_empty_patch_document(content: &str) -> String {
    let mut meaningful = content.lines().filter(|line| {
        let trimmed = line.trim();
        !trimmed.is_empty() && !trimmed.starts_with('#')
    });
    if meaningful.next() == Some("[]") && meaningful.next().is_none() {
        content
            .lines()
            .filter(|line| line.trim() != "[]")
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        content.to_string()
    }
}

fn profile_from_launch(launch: &LaunchDescriptor) -> String {
    if launch.args.first().map(String::as_str) == Some("web") {
        return "web".to_string();
    }
    for pair in launch.args.windows(2) {
        if pair[0] == "--profile" && !pair[1].is_empty() {
            return pair[1].clone();
        }
    }
    "web".to_string()
}

fn disable_plugin_from_request(body: &str) -> std::io::Result<String> {
    let launch = read_launch_descriptor()?;
    let value: serde_json::Value = serde_json::from_str(body)
        .map_err(|error| supervisor_error(format!("invalid disable-plugin request: {error}")))?;
    let plugin_id = value
        .get("pluginId")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| supervisor_error("disable-plugin request requires pluginId"))?;
    let reason = value.get("reason").and_then(serde_json::Value::as_str);
    let profile = profile_from_launch(&launch);
    disable_plugin_for_profile(&profile, plugin_id, reason)?;
    Ok(format!(
        "{{\"ok\":true,\"profile\":{},\"pluginId\":{}}}",
        serde_json::to_string(&profile).unwrap_or_else(|_| "\"web\"".to_string()),
        serde_json::to_string(plugin_id).unwrap_or_else(|_| "\"\"".to_string()),
    ))
}

fn request_body(request: &str) -> &str {
    request.split("\r\n\r\n").nth(1).unwrap_or_default()
}

fn restart_dsh() -> std::io::Result<()> {
    restart_dsh_web()
        .map(|_| ())
        .or_else(|_| restart_from_launch_descriptor())
}

fn update_response(update: Option<&Update>) -> String {
    match update {
        Some(update) => serde_json::json!({
            "ok": true,
            "available": true,
            "currentVersion": update.current_version,
            "version": update.version,
            "target": update.target,
            "url": update.download_url.to_string(),
            "notes": update.body,
            "date": update.date.map(|date| date.to_string()),
        })
        .to_string(),
        None => serde_json::json!({
            "ok": true,
            "available": false,
            "currentVersion": VERSION,
        })
        .to_string(),
    }
}

fn check_update(app: &AppHandle) -> Result<String, String> {
    let update = tauri::async_runtime::block_on(async {
        let updater = app.updater().map_err(|error| error.to_string())?;
        updater.check().await.map_err(|error| error.to_string())
    })?;
    Ok(update_response(update.as_ref()))
}

fn install_update(app: AppHandle) -> Result<String, String> {
    let version = tauri::async_runtime::block_on(async {
        let updater = app.updater().map_err(|error| error.to_string())?;
        let Some(update) = updater.check().await.map_err(|error| error.to_string())? else {
            return Err("no update available".to_string());
        };
        let version = update.version.clone();
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|error| error.to_string())?;
        Ok::<String, String>(version)
    })?;
    app.request_restart();
    Ok(serde_json::json!({
        "ok": true,
        "installed": true,
        "version": version,
        "restart": "requested",
    })
    .to_string())
}

fn show_dialog(app: &AppHandle, title: &str, message: impl Into<String>, kind: MessageDialogKind) {
    app.dialog()
        .message(message)
        .title(title)
        .kind(kind)
        .blocking_show();
}

fn check_update_with_prompt(app: AppHandle) -> Result<(), String> {
    let update = match tauri::async_runtime::block_on(async {
        let updater = app.updater().map_err(|error| error.to_string())?;
        updater.check().await.map_err(|error| error.to_string())
    }) {
        Ok(update) => update,
        Err(error) => {
            show_dialog(
                &app,
                "DSH Desktop Supervisor Update Failed",
                &error,
                MessageDialogKind::Error,
            );
            return Err(error);
        }
    };
    let Some(update) = update else {
        show_dialog(
            &app,
            "DSH Desktop Supervisor",
            format!("You are already running the latest tray app ({VERSION})."),
            MessageDialogKind::Info,
        );
        return Ok(());
    };
    let version = update.version.clone();
    let message = format!(
        "A signed tray app update is available: {version}.\n\nInstall it now and relaunch DSH Desktop Supervisor?"
    );
    let should_install = app
        .dialog()
        .message(message)
        .title("DSH Desktop Supervisor Update")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install and Relaunch".to_string(),
            "Not Now".to_string(),
        ))
        .blocking_show();
    if !should_install {
        return Ok(());
    }
    let install_result = tauri::async_runtime::block_on(async {
        update
            .download_and_install(|_, _| {}, || {})
            .await
            .map_err(|error| error.to_string())
    });
    match install_result {
        Ok(()) => {
            show_dialog(
                &app,
                "DSH Desktop Supervisor Update",
                format!("Update {version} installed. The tray app will relaunch now."),
                MessageDialogKind::Info,
            );
            app.request_restart();
            Ok(())
        }
        Err(error) => {
            show_dialog(
                &app,
                "DSH Desktop Supervisor Update Failed",
                &error,
                MessageDialogKind::Error,
            );
            Err(error)
        }
    }
}

fn install_update_with_prompt(app: AppHandle) -> Result<(), String> {
    match install_update(app.clone()) {
        Ok(_) => Ok(()),
        Err(error) if error == "no update available" => {
            show_dialog(
                &app,
                "DSH Desktop Supervisor",
                format!("You are already running the latest tray app ({VERSION})."),
                MessageDialogKind::Info,
            );
            Ok(())
        }
        Err(error) => {
            show_dialog(
                &app,
                "DSH Desktop Supervisor Update Failed",
                &error,
                MessageDialogKind::Error,
            );
            Err(error)
        }
    }
}

fn serve(mut stream: TcpStream, token: &str, app: &AppHandle) {
    let Ok(request) = read_http_request(&mut stream) else {
        return;
    };
    let first_line = request.lines().next().unwrap_or_default();
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let path = parts.next().unwrap_or("/");
    match (method, path) {
        ("GET", "/health") => respond(stream, "200 OK", "{\"ok\":true}"),
        ("GET", "/status") => respond(
            stream,
            "200 OK",
            &format!(
                "{{\"state\":\"running\",\"version\":\"{VERSION}\",\"dsh\":{{\"detected\":true,\"url\":\"http://127.0.0.1:3080\"}}}}"
            ),
        ),
        ("POST", "/pair") if authorized(&request, token) => respond(stream, "200 OK", "{\"ok\":true}"),
        ("POST", "/pair") => respond(stream, "401 Unauthorized", "{\"error\":\"unauthorized\"}"),
        ("POST", "/restart") if authorized(&request, token) => match restart_dsh() {
            Ok(_) => respond(stream, "200 OK", "{\"ok\":true}"),
            Err(error) => respond(
                stream,
                "502 Bad Gateway",
                &format!("{{\"error\":{}}}", serde_json::to_string(&error.to_string()).unwrap_or_else(|_| "\"restart failed\"".to_string())),
            ),
        },
        ("POST", "/restart") => respond(stream, "401 Unauthorized", "{\"error\":\"unauthorized\"}"),
        ("POST", "/check-update") if authorized(&request, token) => match check_update(app) {
            Ok(body) => respond(stream, "200 OK", &body),
            Err(error) => respond(
                stream,
                "502 Bad Gateway",
                &format!(
                    "{{\"error\":{}}}",
                    serde_json::to_string(&error)
                        .unwrap_or_else(|_| "\"update check failed\"".to_string())
                ),
            ),
        },
        ("POST", "/check-update") => respond(stream, "401 Unauthorized", "{\"error\":\"unauthorized\"}"),
        ("POST", "/install-update") if authorized(&request, token) => match install_update(app.clone()) {
            Ok(body) => respond(stream, "200 OK", &body),
            Err(error) => respond(
                stream,
                "502 Bad Gateway",
                &format!(
                    "{{\"error\":{}}}",
                    serde_json::to_string(&error)
                        .unwrap_or_else(|_| "\"update install failed\"".to_string())
                ),
            ),
        },
        ("POST", "/install-update") => respond(stream, "401 Unauthorized", "{\"error\":\"unauthorized\"}"),
        ("POST", "/disable-plugin") if authorized(&request, token) => {
            match disable_plugin_from_request(request_body(&request)) {
                Ok(body) => respond(stream, "200 OK", &body),
                Err(error) => respond(
                    stream,
                    "400 Bad Request",
                    &format!("{{\"error\":{}}}", serde_json::to_string(&error.to_string()).unwrap_or_else(|_| "\"disable plugin failed\"".to_string())),
                ),
            }
        },
        ("POST", "/disable-plugin") => respond(stream, "401 Unauthorized", "{\"error\":\"unauthorized\"}"),
        _ => respond(stream, "404 Not Found", "{\"error\":\"not found\"}"),
    }
}

fn start_control_server(token: String, app: AppHandle) -> std::io::Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            serve(stream, &token, &app);
        }
    });
    Ok(port)
}

fn write_control_file(paths: &SupervisorPaths, port: u16) -> std::io::Result<()> {
    let control = format!(
        "{{\n  \"schema\": 1,\n  \"app\": \"dsh-desktop-supervisor\",\n  \"version\": \"{VERSION}\",\n  \"pid\": {},\n  \"url\": \"http://127.0.0.1:{port}\",\n  \"tokenPath\": {},\n  \"capabilities\": [\"status\", \"tray\", \"pair\", \"restartDsh\", \"disablePlugin\", \"checkUpdate\", \"installUpdate\"]\n}}\n",
        std::process::id(),
        serde_json::to_string(&paths.token_path.to_string_lossy()).unwrap_or_else(|_| "\"\"".to_string()),
    );
    fs::write(paths.root.join("control.json"), control)
}

fn open_dsh_web() -> std::io::Result<()> {
    if cfg!(target_os = "macos") {
        Command::new("open").arg("http://127.0.0.1:3080").spawn()?;
    } else if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", "start", "", "http://127.0.0.1:3080"])
            .spawn()?;
    } else {
        Command::new("xdg-open")
            .arg("http://127.0.0.1:3080")
            .spawn()?;
    }
    Ok(())
}

fn main() {
    let paths =
        ensure_supervisor_paths().expect("supervisor descriptor directory must be writable");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            let port = start_control_server(paths.token.clone(), app.handle().clone())?;
            write_control_file(&paths, port)?;
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                app.set_dock_visibility(false);
            }
            let open = MenuItem::with_id(app, "open", "Open DSH Web", true, None::<&str>)?;
            let restart = MenuItem::with_id(app, "restart", "Restart DSH", true, None::<&str>)?;
            let check_update =
                MenuItem::with_id(app, "check_update", "Check for Updates", true, None::<&str>)?;
            let install_update = MenuItem::with_id(
                app,
                "install_update",
                "Install Update and Relaunch",
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&open, &restart, &check_update, &install_update, &quit],
            )?;
            let tray_icon = Image::new(TRAY_ICON_RGBA, 32, 32);
            let tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("DSH Desktop Supervisor")
                .title("DSH")
                .icon(tray_icon)
                .icon_as_template(true);
            let _tray = tray.build(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                let _ = open_dsh_web();
            }
            "restart" => {
                let _ = restart_dsh();
            }
            "check_update" => {
                let app = app.clone();
                thread::spawn(move || {
                    let _ = check_update_with_prompt(app);
                });
            }
            "install_update" => {
                let app = app.clone();
                thread::spawn(move || {
                    let _ = install_update_with_prompt(app);
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("tauri runtime failed");
}
