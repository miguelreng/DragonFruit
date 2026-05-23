use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, PhysicalPosition, Position, WindowEvent};

fn position_window_near_tray(window: &tauri::WebviewWindow, x: f64, y: f64) {
  let Ok(size) = window.outer_size() else {
    return;
  };
  let half_width = (size.width / 2) as i32;
  let target_x = (x as i32 - half_width).max(0);
  let target_y = (y as i32 + 8).max(0);
  let _ = window.set_position(Position::Physical(PhysicalPosition::new(target_x, target_y)));
}

#[tauri::command]
fn ping() -> &'static str {
  "pong"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      let open = MenuItem::with_id(app, "open", "Open DragonFruit Mini", true, None::<&str>)?;
      let start_recording = MenuItem::with_id(app, "start_recording", "Start Recording", true, None::<&str>)?;
      let hide = MenuItem::with_id(app, "hide", "Hide Window", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&open, &start_recording, &hide, &quit])?;

      let mut tray_builder = TrayIconBuilder::new().menu(&menu);
      if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
      }

      let _tray = tray_builder
        .on_menu_event(|app_handle, event| match event.id().as_ref() {
          "open" => {
            if let Some(window) = app_handle.get_webview_window("main") {
              if let Ok(Some(monitor)) = window.current_monitor() {
                let monitor_size = monitor.size();
                let window_size = window.outer_size().ok();
                let width = window_size.map(|size| size.width as i32).unwrap_or(420);
                let x = (monitor_size.width as i32 - width - 20).max(0);
                let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, 34)));
              }
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
          "start_recording" => {
            if let Some(window) = app_handle.get_webview_window("main") {
              if let Ok(Some(monitor)) = window.current_monitor() {
                let monitor_size = monitor.size();
                let window_size = window.outer_size().ok();
                let width = window_size.map(|size| size.width as i32).unwrap_or(420);
                let x = (monitor_size.width as i32 - width - 20).max(0);
                let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, 34)));
              }
              let _ = window.show();
              let _ = window.set_focus();
              let _ = window.emit("mini://start-recording", ());
            }
          }
          "hide" => {
            if let Some(window) = app_handle.get_webview_window("main") {
              let _ = window.hide();
            }
          }
          "quit" => app_handle.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            position,
            ..
          } = event
          {
            let app_handle = tray.app_handle();
            if let Some(window) = app_handle.get_webview_window("main") {
              if window.is_visible().ok() == Some(true) {
                let _ = window.hide();
              } else {
                position_window_near_tray(&window, position.x, position.y);
                let _ = window.show();
                let _ = window.set_focus();
              }
            }
          }
        })
        .build(app)?;

      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .invoke_handler(tauri::generate_handler![ping])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
