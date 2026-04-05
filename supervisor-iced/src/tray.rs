/// System tray icon — full context menu wired to a sync channel.
///
/// Callers must keep the returned `TrayIcon` alive for the lifetime of the
/// application (drop it and the tray icon disappears).

use tray_icon::{
    TrayIcon, TrayIconBuilder,
    menu::{Menu, MenuItem, PredefinedMenuItem, MenuEvent},
};

// ─────────────────────────────────────────────────────────────────────────────
/// Actions that the tray menu can request.
#[derive(Debug, Clone)]
pub enum TrayAction {
    Show,
    Minimize,
    RestartServices,
    OpenPlans,
    OpenSprints,
    OpenSettings,
    ToggleBroadcast,
    CheckUpgrade,
    Quit,
}

// ─────────────────────────────────────────────────────────────────────────────
/// Generate a simple 32×32 purple solid icon from raw RGBA bytes.
fn make_icon() -> tray_icon::Icon {
    const SIZE: u32 = 32;
    let mut rgba: Vec<u8> = Vec::with_capacity((SIZE * SIZE * 4) as usize);

    for row in 0..SIZE {
        for col in 0..SIZE {
            // Outer border ring → darker purple; interior → brighter purple
            let on_border = row == 0 || row == SIZE - 1 || col == 0 || col == SIZE - 1;
            if on_border {
                rgba.extend_from_slice(&[0x44, 0x1c, 0x8a, 0xff]);
            } else {
                rgba.extend_from_slice(&[0x7c, 0x3a, 0xf5, 0xff]);
            }
        }
    }

    tray_icon::Icon::from_rgba(rgba, SIZE, SIZE).expect("tray icon RGBA")
}

// ─────────────────────────────────────────────────────────────────────────────
/// Build and register the system tray icon, wiring click events to `tx`.
///
/// `broadcast_on` controls the label shown for the broadcast toggle item.
/// Returns the `TrayIcon` handle — the caller **must** keep it alive.
pub fn init_tray(
    tx: std::sync::mpsc::SyncSender<TrayAction>,
    broadcast_on: bool,
) -> TrayIcon {
    let menu = Menu::new();

    // ── Group 1: window visibility ────────────────────────────────────────────
    let show_item     = MenuItem::new("Show",             true, None);
    let minimize_item = MenuItem::new("Minimize to Tray", true, None);

    // ── Group 2: navigation ───────────────────────────────────────────────────
    let plans_item    = MenuItem::new("Open Plans",    true, None);
    let sprints_item  = MenuItem::new("Open Sprints",  true, None);
    let settings_item = MenuItem::new("Open Settings", true, None);

    // ── Group 3: broadcast toggle + upgrade ───────────────────────────────────
    let broadcast_label = if broadcast_on {
        "Broadcast: ON"
    } else {
        "Broadcast: OFF"
    };
    let broadcast_item = MenuItem::new(broadcast_label, true, None);
    let upgrade_item   = MenuItem::new("Check for Updates", true, None);

    // ── Group 4: restart / quit ───────────────────────────────────────────────
    let restart_item = MenuItem::new("Restart Services", true, None);
    let quit_item    = MenuItem::new("Quit",             true, None);

    menu.append_items(&[
        &show_item,
        &minimize_item,
        &PredefinedMenuItem::separator(),
        &plans_item,
        &sprints_item,
        &settings_item,
        &PredefinedMenuItem::separator(),
        &broadcast_item,
        &upgrade_item,
        &PredefinedMenuItem::separator(),
        &restart_item,
        &quit_item,
    ])
    .expect("tray menu append");

    // Clone MenuIds before they are consumed by the move closure.
    let show_id      = show_item.id().clone();
    let minimize_id  = minimize_item.id().clone();
    let plans_id     = plans_item.id().clone();
    let sprints_id   = sprints_item.id().clone();
    let settings_id  = settings_item.id().clone();
    let broadcast_id = broadcast_item.id().clone();
    let upgrade_id   = upgrade_item.id().clone();
    let restart_id   = restart_item.id().clone();
    let quit_id      = quit_item.id().clone();

    MenuEvent::set_event_handler(Some(move |event: MenuEvent| {
        let action = if event.id == show_id {
            TrayAction::Show
        } else if event.id == minimize_id {
            TrayAction::Minimize
        } else if event.id == plans_id {
            TrayAction::OpenPlans
        } else if event.id == sprints_id {
            TrayAction::OpenSprints
        } else if event.id == settings_id {
            TrayAction::OpenSettings
        } else if event.id == broadcast_id {
            TrayAction::ToggleBroadcast
        } else if event.id == upgrade_id {
            TrayAction::CheckUpgrade
        } else if event.id == restart_id {
            TrayAction::RestartServices
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
        .with_tooltip("Project Memory Supervisor")
        .with_icon(make_icon())
        .build()
        .expect("TrayIconBuilder::build")
}
