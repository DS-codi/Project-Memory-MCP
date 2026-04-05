/// System tray icon — full context menu wired to a sync channel.
///
/// Callers must keep the returned `TrayIcon` alive for the lifetime of the
/// application (drop it and the tray icon disappears).

use tray_icon::{
    TrayIcon, TrayIconBuilder,
    menu::{Menu, MenuItem, PredefinedMenuItem, MenuEvent},
};

use crate::types::TrayAction;

// ─────────────────────────────────────────────────────────────────────────────
/// Generate a simple 32×32 teal/green solid icon from raw RGBA bytes.
fn make_icon() -> tray_icon::Icon {
    const SIZE: u32 = 32;
    let mut rgba: Vec<u8> = Vec::with_capacity((SIZE * SIZE * 4) as usize);

    for row in 0..SIZE {
        for col in 0..SIZE {
            // Outer border ring → darker teal; interior → brighter teal/green
            let on_border = row == 0 || row == SIZE - 1 || col == 0 || col == SIZE - 1;
            if on_border {
                rgba.extend_from_slice(&[0x0a, 0x5c, 0x4a, 0xff]);
            } else {
                rgba.extend_from_slice(&[0x10, 0xb9, 0x81, 0xff]);
            }
        }
    }

    tray_icon::Icon::from_rgba(rgba, SIZE, SIZE).expect("tray icon RGBA")
}

// ─────────────────────────────────────────────────────────────────────────────
/// Build and register the system tray icon, wiring click events to `tx`.
///
/// `start_with_windows` controls the label shown for the start-with-Windows
/// toggle item. Returns the `TrayIcon` handle — the caller **must** keep it alive.
pub fn init_tray(
    tx: std::sync::mpsc::SyncSender<TrayAction>,
    start_with_windows: bool,
) -> TrayIcon {
    let menu = Menu::new();

    // ── Group 1: window visibility ────────────────────────────────────────────
    let show_item = MenuItem::new("Show", true, None);

    // ── Group 2: startup toggle ───────────────────────────────────────────────
    let startup_label = if start_with_windows {
        "Start with Windows  ✓"
    } else {
        "Start with Windows"
    };
    let startup_item = MenuItem::new(startup_label, true, None);

    // ── Group 3: quit ─────────────────────────────────────────────────────────
    let quit_item = MenuItem::new("Quit", true, None);

    menu.append_items(&[
        &show_item,
        &PredefinedMenuItem::separator(),
        &startup_item,
        &PredefinedMenuItem::separator(),
        &quit_item,
    ])
    .expect("tray menu append");

    // Clone MenuIds before they are consumed by the move closure.
    let show_id    = show_item.id().clone();
    let startup_id = startup_item.id().clone();
    let quit_id    = quit_item.id().clone();

    MenuEvent::set_event_handler(Some(move |event: MenuEvent| {
        let action = if event.id == show_id {
            TrayAction::Show
        } else if event.id == startup_id {
            TrayAction::ToggleStartWithWindows
        } else if event.id == quit_id {
            TrayAction::Quit
        } else {
            return;
        };
        // try_send is non-blocking; silently drop if buffer full.
        let _ = tx.try_send(action);
    }));

    TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip("Interactive Terminal")
        .with_icon(make_icon())
        .build()
        .expect("TrayIconBuilder::build")
}

/// Update the tray tooltip with live status metrics.
///
/// Call this whenever pending count / CPU / RAM readings change.
pub fn update_tooltip(tray: &TrayIcon, pending: usize, cpu: f32, ram: f32) {
    let tip = format!(
        "Interactive Terminal | Pending: {pending} | CPU: {cpu:.0}% | RAM: {ram:.0} MB"
    );
    let _ = tray.set_tooltip(Some(tip));
}

// TODO STATUS: done
