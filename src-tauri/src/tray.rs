//! The optional system tray / menu bar icon. It only opens or quits the app:
//! nothing can be approved from here.

use std::sync::{Mutex, MutexGuard};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Window, WindowEvent, Wry};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::platform;

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
                ..
            } = event
            {
                show_main(tray.app_handle());
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

fn request_quit(app: &AppHandle) {
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
    if window.label() != "main" {
        return;
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        let app = window.app_handle();
        let hide = {
            let inner = lock(app);
            close_hides(inner.menu.is_some(), inner.keep_running)
        };
        if hide {
            api.prevent_close();
            let _ = window.hide();
        }
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
