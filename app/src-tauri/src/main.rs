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

const VERSION: &str = env!("CARGO_PKG_VERSION");
const TRAY_ICON_RGBA: &[u8] = include_bytes!("../icons/tray-template.rgba");

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

fn serve(mut stream: TcpStream, token: &str) {
    let mut buffer = [0_u8; 2048];
    let Ok(size) = stream.read(&mut buffer) else {
        return;
    };
    let request = String::from_utf8_lossy(&buffer[..size]);
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
        _ => respond(stream, "404 Not Found", "{\"error\":\"not found\"}"),
    }
}

fn start_control_server(token: String) -> std::io::Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            serve(stream, &token);
        }
    });
    Ok(port)
}

fn write_control_file(paths: &SupervisorPaths, port: u16) -> std::io::Result<()> {
    let control = format!(
        "{{\n  \"schema\": 1,\n  \"app\": \"dsh-desktop-supervisor\",\n  \"version\": \"{VERSION}\",\n  \"pid\": {},\n  \"url\": \"http://127.0.0.1:{port}\",\n  \"tokenPath\": {},\n  \"capabilities\": [\"status\", \"tray\", \"pair\"]\n}}\n",
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
    let port =
        start_control_server(paths.token.clone()).expect("control server must bind loopback");
    write_control_file(&paths, port).expect("control descriptor must be writable");

    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                app.set_dock_visibility(false);
            }
            let open = MenuItem::with_id(app, "open", "Open DSH Web", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
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
            "quit" => app.exit(0),
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("tauri runtime failed");
}
