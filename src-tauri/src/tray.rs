//! The optional system tray / menu bar icon and its small panel. They only show readings and open or
//! quit the app: nothing can be approved from them.

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Manager, PhysicalPosition, Rect, WebviewUrl, WebviewWindowBuilder, Window,
    WindowEvent, Wry,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::platform;

/// The panel window's label; `capabilities/tray.json` names it too.
pub const PANEL: &str = "tray";
const PANEL_W: f64 = 300.0;
const PANEL_H: f64 = 440.0;
const GAP: f64 = 8.0;

const ID: &str = "main";
const OPEN: &str = "tray-open";
const QUIT: &str = "tray-quit";
const MAX_LINES: usize = 8;
const MAX_CHARS: usize = 60;
const ICON: &[u8] = include_bytes!("../icons/tray.png");
const ICON_WAITING: &[u8] = include_bytes!("../icons/tray-waiting.png");

/// A hidden window is only safe when there is a tray icon to bring it back.
pub fn close_hides(tray_created: bool, keep_running: bool) -> bool {
    tray_created && keep_running
}

pub fn quit_needs_confirm(running: u32, pending: u32) -> bool {
    running > 0 || pending > 0
}

/// Text safe to put in a native menu.
pub fn menu_lines(lines: &[String]) -> Vec<String> {
    lines
        .iter()
        .map(|line| {
            let flat: String = line
                .chars()
                .map(|c| if c.is_control() { ' ' } else { c })
                .collect();
            flat.trim().chars().take(MAX_CHARS).collect::<String>()
        })
        .filter(|line| !line.is_empty())
        .take(MAX_LINES)
        .collect()
}

/// The app's own commands (which include approving permission requests) are for the main window only.
pub fn commands_allowed(window: &str) -> bool {
    window == "main"
}

#[derive(Clone, Copy)]
pub struct Area {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Centred on the icon: above it in the lower half of the screen, otherwise below; always on screen.
pub fn panel_position(icon: Area, (w, h): (f64, f64), screen: Area) -> (f64, f64) {
    let x = icon.x + icon.w / 2.0 - w / 2.0;
    let y = if icon.y + icon.h / 2.0 > screen.y + screen.h / 2.0 {
        icon.y - h - GAP
    } else {
        icon.y + icon.h + GAP
    };
    // min before max: a panel larger than the screen starts at its edge.
    (
        x.min(screen.x + screen.w - w).max(screen.x),
        y.min(screen.y + screen.h - h).max(screen.y),
    )
}

/// What the window last reported about all sessions.
#[derive(Default, Clone, PartialEq)]
pub struct Status {
    pub waiting: bool,
    pub running: u32,
    pub pending: u32,
    pub title: Option<String>,
    pub lines: Vec<String>,
}

#[derive(Default)]
struct Inner {
    /// Kept while the icon exists. Linux cannot swap a tray's menu, so its items are replaced instead.
    menu: Option<Menu<Wry>>,
    keep_running: bool,
    status: Status,
    /// When losing focus last hid the panel.
    panel_blurred: Option<Instant>,
}

#[derive(Default)]
pub struct TrayState(Mutex<Inner>);

fn lock(app: &AppHandle) -> MutexGuard<'_, Inner> {
    app.state::<TrayState>()
        .inner()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

pub fn apply(app: &AppHandle, enabled: bool, keep_running: bool) -> Result<(), String> {
    let existing = lock(app).menu.is_some();
    if enabled && !existing {
        let menu = create(app).map_err(|e| format!("The tray icon couldn't be created: {e}"))?;
        lock(app).menu = Some(menu);
    } else if !enabled && existing {
        app.remove_tray_by_id(ID);
        lock(app).menu = None;
        destroy_panel(app);
        // The icon was the way back to a hidden window.
        show_main(app);
    }
    lock(app).keep_running = enabled && keep_running;
    render(app).map_err(|e| format!("The tray icon couldn't be updated: {e}"))
}

pub fn update(app: &AppHandle, status: Status) -> Result<(), String> {
    {
        let mut inner = lock(app);
        if inner.status == status {
            return Ok(());
        }
        inner.status = status;
    }
    render(app).map_err(|e| format!("The tray icon couldn't be updated: {e}"))
}

fn create(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    fill(app, &menu, &[])?;
    TrayIconBuilder::with_id(ID)
        .icon(Image::from_bytes(ICON)?)
        .tooltip("BetterClaudeUI")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN => show_main(app),
            QUIT => request_quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                position,
                rect,
                ..
            } = event
            {
                let app = tray.app_handle().clone();
                // Creating a window inside an event handler deadlocks WebView2.
                std::thread::spawn(move || {
                    if toggle_panel(&app, position, rect).is_err() {
                        show_main(&app);
                    }
                });
            }
        })
        .build(app)?;
    Ok(menu)
}

fn fill(app: &AppHandle, menu: &Menu<Wry>, lines: &[String]) -> tauri::Result<()> {
    while menu.remove_at(0)?.is_some() {}
    if platform::tray_menu_lists_readings() {
        let shown = menu_lines(lines);
        for line in &shown {
            menu.append(&MenuItem::new(app, line, false, None::<&str>)?)?;
        }
        if !shown.is_empty() {
            menu.append(&PredefinedMenuItem::separator(app)?)?;
        }
    }
    menu.append(&MenuItem::with_id(
        app,
        OPEN,
        "Open BetterClaudeUI",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(app, QUIT, "Quit", true, None::<&str>)?)?;
    Ok(())
}

fn render(app: &AppHandle) -> tauri::Result<()> {
    let (menu, status) = {
        let inner = lock(app);
        (inner.menu.clone(), inner.status.clone())
    };
    let (Some(menu), Some(tray)) = (menu, app.tray_by_id(ID)) else {
        return Ok(());
    };
    let bytes = if status.waiting { ICON_WAITING } else { ICON };
    tray.set_icon(Some(Image::from_bytes(bytes)?))?;
    tray.set_tooltip(Some(if status.waiting {
        "BetterClaudeUI: Claude is waiting for you"
    } else {
        "BetterClaudeUI"
    }))?;
    if platform::tray_shows_title() {
        let title = status.title.map(|t| t.chars().take(12).collect::<String>());
        tray.set_title(title)?;
    }
    if platform::tray_menu_lists_readings() {
        fill(app, &menu, &status.lines)?;
    }
    Ok(())
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn toggle_panel(app: &AppHandle, click: PhysicalPosition<f64>, icon: Rect) -> tauri::Result<()> {
    if let Some(panel) = app.get_webview_window(PANEL)
        && panel.is_visible()?
    {
        return panel.hide();
    }
    // Pressing the icon already took focus from an open panel and hid it: that click means "close".
    if lock(app)
        .panel_blurred
        .is_some_and(|at| at.elapsed() < Duration::from_millis(300))
    {
        return Ok(());
    }
    let panel = match app.get_webview_window(PANEL) {
        Some(panel) => panel,
        None => WebviewWindowBuilder::new(app, PANEL, WebviewUrl::App("tray".into()))
            .title("BetterClaudeUI")
            .inner_size(PANEL_W, PANEL_H)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .decorations(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .visible(false)
            .build()?,
    };
    if let Some(monitor) = app.monitor_from_point(click.x, click.y)? {
        let scale = monitor.scale_factor();
        let at = icon.position.to_physical::<f64>(scale);
        let size = icon.size.to_physical::<f64>(scale);
        let work = monitor.work_area();
        let (x, y) = panel_position(
            Area {
                x: at.x,
                y: at.y,
                w: size.width,
                h: size.height,
            },
            (PANEL_W * scale, PANEL_H * scale),
            Area {
                x: f64::from(work.position.x),
                y: f64::from(work.position.y),
                w: f64::from(work.size.width),
                h: f64::from(work.size.height),
            },
        );
        panel.set_position(PhysicalPosition::new(x, y))?;
    }
    panel.show()?;
    panel.set_focus()
}

pub fn hide_panel(app: &AppHandle) {
    if let Some(panel) = app.get_webview_window(PANEL) {
        let _ = panel.hide();
    }
}

fn destroy_panel(app: &AppHandle) {
    if let Some(panel) = app.get_webview_window(PANEL) {
        let _ = panel.destroy();
    }
}

pub fn request_quit(app: &AppHandle) {
    let (running, pending) = {
        let inner = lock(app);
        (inner.status.running, inner.status.pending)
    };
    if !quit_needs_confirm(running, pending) {
        app.exit(0);
        return;
    }
    let handle = app.clone();
    app.dialog()
        .message("Claude is still replying or waiting for your answer. Quitting stops it.")
        .title("Quit BetterClaudeUI?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Quit".into(),
            "Cancel".into(),
        ))
        .show(move |quit| {
            if quit {
                handle.exit(0);
            }
        });
}

/// Closing the main window hides it only while the tray asks for that and exists.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let app = window.app_handle();
    match (window.label(), event) {
        ("main", WindowEvent::CloseRequested { api, .. }) => {
            let hide = {
                let inner = lock(app);
                close_hides(inner.menu.is_some(), inner.keep_running)
            };
            if hide {
                api.prevent_close();
                let _ = window.hide();
            } else {
                // A hidden panel is still a window: left alive, it would keep the app running unseen.
                destroy_panel(app);
            }
        }
        (PANEL, WindowEvent::Focused(false)) => {
            lock(app).panel_blurred = Some(Instant::now());
            let _ = window.hide();
        }
        (PANEL, WindowEvent::CloseRequested { api, .. }) => {
            api.prevent_close();
            let _ = window.hide();
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closing_only_hides_when_a_tray_exists_to_bring_the_window_back() {
        assert!(close_hides(true, true));
        assert!(!close_hides(true, false));
        assert!(
            !close_hides(false, true),
            "the window must never become unreachable"
        );
        assert!(!close_hides(false, false));
    }

    #[test]
    fn quitting_asks_first_while_claude_is_replying_or_waiting() {
        assert!(!quit_needs_confirm(0, 0));
        assert!(quit_needs_confirm(1, 0));
        assert!(quit_needs_confirm(0, 1));
        assert!(quit_needs_confirm(2, 3));
    }

    #[test]
    fn only_the_main_window_may_call_the_apps_commands() {
        assert!(commands_allowed("main"));
        assert!(!commands_allowed(PANEL));
        assert!(!commands_allowed(""), "unknown windows get nothing");
    }

    const SCREEN: Area = Area {
        x: 0.0,
        y: 0.0,
        w: 1920.0,
        h: 1040.0,
    };

    #[test]
    fn the_panel_opens_above_a_bottom_taskbar_and_below_a_top_menu_bar() {
        let bottom = Area {
            x: 1500.0,
            y: 1050.0,
            w: 24.0,
            h: 24.0,
        };
        let (x, y) = panel_position(bottom, (300.0, 400.0), SCREEN);
        assert_eq!(x, 1362.0);
        assert_eq!(y, 640.0, "kept inside the work area, above the taskbar");

        let top = Area {
            x: 900.0,
            y: 0.0,
            w: 24.0,
            h: 24.0,
        };
        assert_eq!(panel_position(top, (300.0, 400.0), SCREEN), (762.0, 32.0));
    }

    #[test]
    fn the_panel_never_leaves_the_screen() {
        let corner = Area {
            x: 1910.0,
            y: 1050.0,
            w: 24.0,
            h: 24.0,
        };
        assert_eq!(panel_position(corner, (300.0, 400.0), SCREEN).0, 1620.0);
        let second = Area {
            x: -1920.0,
            y: 0.0,
            w: 1920.0,
            h: 1040.0,
        };
        let far_left = Area {
            x: -1915.0,
            y: 1050.0,
            w: 24.0,
            h: 24.0,
        };
        assert_eq!(panel_position(far_left, (300.0, 400.0), second).0, -1920.0);
        let tiny = Area {
            x: 0.0,
            y: 0.0,
            w: 200.0,
            h: 200.0,
        };
        assert_eq!(panel_position(corner, (300.0, 400.0), tiny), (0.0, 0.0));
    }

    #[test]
    fn menu_lines_are_capped_in_number_and_length() {
        let many: Vec<String> = (0..20).map(|i| format!("Line {i}")).collect();
        let shown = menu_lines(&many);
        assert_eq!(shown.len(), 8);
        assert_eq!(shown[0], "Line 0");

        let long = vec!["é".repeat(200)];
        assert_eq!(menu_lines(&long)[0].chars().count(), 60);
    }

    #[test]
    fn menu_lines_drop_blanks_and_control_characters() {
        let odd = vec!["  ".into(), "Today:\n\t$1.00 ".into(), String::new()];
        assert_eq!(menu_lines(&odd), vec!["Today:  $1.00".to_string()]);
    }
}
