use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, ShortcutState};

const PET_SHORTCUT: &str = "Ctrl+Shift+Space";
const TODO_SHORTCUT: &str = "Ctrl+Shift+T";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowPlacement {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub maximized: bool,
    pub monitor_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DesktopPreferences {
    pub background_resident: bool,
    pub shortcuts_enabled: bool,
}

impl Default for DesktopPreferences {
    fn default() -> Self {
        Self {
            background_resident: false,
            shortcuts_enabled: true,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct PersistedDesktopState {
    preferences: DesktopPreferences,
    windows: HashMap<String, WindowPlacement>,
}

pub struct DesktopState {
    path: PathBuf,
    value: Mutex<PersistedDesktopState>,
    exiting: AtomicBool,
    background_item: Mutex<Option<CheckMenuItem<tauri::Wry>>>,
}

impl DesktopState {
    fn load(path: PathBuf) -> Self {
        let value = fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default();
        Self {
            path,
            value: Mutex::new(value),
            exiting: AtomicBool::new(false),
            background_item: Mutex::new(None),
        }
    }

    fn save(&self) -> Result<(), String> {
        let value = self.value.lock().map_err(|_| "桌面状态锁定失败")?.clone();
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let json = serde_json::to_vec_pretty(&value).map_err(|error| error.to_string())?;
        fs::write(&self.path, json).map_err(|error| error.to_string())
    }

    fn preferences(&self) -> DesktopPreferences {
        self.value
            .lock()
            .map(|state| state.preferences.clone())
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone)]
struct WorkArea {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
    name: Option<String>,
}

fn clamp_placement(
    mut placement: WindowPlacement,
    areas: &[WorkArea],
    fallback_size: (u32, u32),
) -> WindowPlacement {
    let Some(area) = areas
        .iter()
        .find(|area| area.name.is_some() && area.name == placement.monitor_name)
        .or_else(|| {
            areas.iter().find(|area| {
                let right = placement.x.saturating_add(placement.width as i32);
                let bottom = placement.y.saturating_add(placement.height as i32);
                let area_right = area.x.saturating_add(area.width as i32);
                let area_bottom = area.y.saturating_add(area.height as i32);
                right > area.x + 80
                    && placement.x < area_right - 80
                    && bottom > area.y + 60
                    && placement.y < area_bottom - 60
            })
        })
        .or_else(|| areas.first())
    else {
        return placement;
    };

    if placement.scale_factor.is_finite()
        && placement.scale_factor > 0.0
        && area.scale_factor.is_finite()
        && area.scale_factor > 0.0
        && (placement.scale_factor - area.scale_factor).abs() > f64::EPSILON
    {
        let ratio = area.scale_factor / placement.scale_factor;
        placement.x = area.x + (((placement.x - area.x) as f64) * ratio).round() as i32;
        placement.y = area.y + (((placement.y - area.y) as f64) * ratio).round() as i32;
        placement.width = ((placement.width as f64) * ratio).round().max(1.0) as u32;
        placement.height = ((placement.height as f64) * ratio).round().max(1.0) as u32;
        placement.scale_factor = area.scale_factor;
    }
    placement.width = placement
        .width
        .min(area.width)
        .max(fallback_size.0.min(area.width));
    placement.height = placement
        .height
        .min(area.height)
        .max(fallback_size.1.min(area.height));
    let max_x = area
        .x
        .saturating_add(area.width.saturating_sub(placement.width) as i32);
    let max_y = area
        .y
        .saturating_add(area.height.saturating_sub(placement.height) as i32);
    placement.x = placement.x.clamp(area.x, max_x);
    placement.y = placement.y.clamp(area.y, max_y);
    placement
}

fn work_areas<R: Runtime>(window: &WebviewWindow<R>) -> Vec<WorkArea> {
    window
        .available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|monitor| {
            let work = monitor.work_area();
            WorkArea {
                x: work.position.x,
                y: work.position.y,
                width: work.size.width,
                height: work.size.height,
                scale_factor: monitor.scale_factor(),
                name: monitor.name().cloned(),
            }
        })
        .collect()
}

fn restore_window<R: Runtime>(
    window: &WebviewWindow<R>,
    placement: Option<WindowPlacement>,
    fallback_size: (u32, u32),
    pet: bool,
) {
    let areas = work_areas(window);
    let target = placement.unwrap_or_else(|| {
        let area = areas.first().cloned().unwrap_or(WorkArea {
            x: 0,
            y: 0,
            width: 1280,
            height: 800,
            scale_factor: 1.0,
            name: None,
        });
        let x = if pet {
            area.x + area.width.saturating_sub(fallback_size.0 + 20) as i32
        } else {
            area.x + 40
        };
        let y = if pet {
            area.y + area.height.saturating_sub(fallback_size.1 + 20) as i32
        } else {
            area.y + 40
        };
        WindowPlacement {
            x,
            y,
            width: fallback_size.0,
            height: fallback_size.1,
            scale_factor: 1.0,
            maximized: false,
            monitor_name: None,
        }
    });
    let target = clamp_placement(target, &areas, fallback_size);
    let _ = window.set_size(PhysicalSize::new(target.width, target.height));
    let _ = window.set_position(PhysicalPosition::new(target.x, target.y));
    if target.maximized {
        let _ = window.maximize();
    }
}

pub fn capture_window<R: Runtime>(app: &AppHandle<R>, label: &str) {
    let Some(window) = app.get_webview_window(label) else {
        return;
    };
    let (Ok(position), Ok(size), Ok(scale_factor), Ok(maximized)) = (
        window.outer_position(),
        window.outer_size(),
        window.scale_factor(),
        window.is_maximized(),
    ) else {
        return;
    };
    let monitor_name = window
        .current_monitor()
        .ok()
        .flatten()
        .and_then(|monitor| monitor.name().cloned());
    let placement = WindowPlacement {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        scale_factor,
        maximized,
        monitor_name,
    };
    let state = app.state::<DesktopState>();
    if let Ok(mut value) = state.value.lock() {
        value.windows.insert(label.to_owned(), placement);
    }
    let _ = state.save();
}

fn show_window<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn quit<R: Runtime>(app: &AppHandle<R>) {
    app.state::<DesktopState>()
        .exiting
        .store(true, Ordering::SeqCst);
    if let Some(pet) = app.get_webview_window("pet") {
        let _ = pet.destroy();
    }
    app.exit(0);
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    let path = app
        .path()
        .app_local_data_dir()
        .map(|path| path.join("desktop-state.json"))
        .unwrap_or_else(|error| {
            log::warn!("无法确定应用数据目录，窗口状态将保存到临时目录：{error}");
            std::env::temp_dir()
                .join("com.loongdesk.yuan")
                .join("desktop-state.json")
        });
    app.manage(DesktopState::load(path));

    let stored = app
        .state::<DesktopState>()
        .value
        .lock()
        .ok()
        .map(|state| state.windows.clone())
        .unwrap_or_default();
    if let Some(main) = app.get_webview_window("main") {
        restore_window(&main, stored.get("main").cloned(), (960, 640), false);
    }
    if let Some(pet) = app.get_webview_window("pet") {
        restore_window(&pet, stored.get("pet").cloned(), (230, 320), true);
    }

    if let Err(error) = setup_tray(app) {
        log::warn!("系统托盘初始化失败，主窗口仍可正常使用：{error}");
    }

    let prefs = app.state::<DesktopState>().preferences();
    if prefs.shortcuts_enabled {
        let shortcut_result = app
            .global_shortcut()
            .register(PET_SHORTCUT)
            .and_then(|_| app.global_shortcut().register(TODO_SHORTCUT));
        if let Err(error) = shortcut_result {
            let _ = app.global_shortcut().unregister_all();
            let state = app.state::<DesktopState>();
            if let Ok(mut value) = state.value.lock() {
                value.preferences.shortcuts_enabled = false;
            }
            let _ = state.save();
            log::warn!("全局快捷键注册失败，应用将继续启动：{error}");
        }
    }
    Ok(())
}

fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let show_main = MenuItem::with_id(app, "show-main", "打开御案", true, None::<&str>)?;
    let show_pet = MenuItem::with_id(app, "show-pet", "唤起小安子", true, None::<&str>)?;
    let background = CheckMenuItem::with_id(
        app,
        "background",
        "关闭主窗后驻留后台",
        true,
        app.state::<DesktopState>()
            .preferences()
            .background_resident,
        None::<&str>,
    )?;
    let quick_todo =
        MenuItem::with_id(app, "quick-todo", "快速添加待办", true, Some(TODO_SHORTCUT))?;
    let quit_item = MenuItem::with_id(app, "quit", "退出御案", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &show_main,
            &show_pet,
            &quick_todo,
            &background,
            &PredefinedMenuItem::separator(app)?,
            &quit_item,
        ],
    )?;
    let background_toggle = background.clone();
    if let Ok(mut item) = app.state::<DesktopState>().background_item.lock() {
        *item = Some(background.clone());
    }
    let mut tray_builder = TrayIconBuilder::with_id("yuan-tray");
    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    } else {
        log::warn!("未找到默认应用图标，托盘将使用系统默认图标");
    }
    tray_builder
        .tooltip("御案")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show-main" => show_window(app, "main"),
            "show-pet" => show_window(app, "pet"),
            "quick-todo" => {
                show_window(app, "main");
                let _ = app.emit_to("main", "yuan://open-route", "/todos?quick=1");
            }
            "background" => {
                let enabled = background_toggle.is_checked().unwrap_or(false);
                let state = app.state::<DesktopState>();
                if let Ok(mut value) = state.value.lock() {
                    value.preferences.background_resident = enabled;
                }
                let _ = state.save();
            }
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_window(tray.app_handle(), "main");
            }
        })
        .build(app)?;
    Ok(())
}

pub fn handle_shortcut<R: Runtime>(
    app: &AppHandle<R>,
    shortcut: &tauri_plugin_global_shortcut::Shortcut,
    event: tauri_plugin_global_shortcut::ShortcutEvent,
) {
    if event.state != ShortcutState::Pressed {
        return;
    }
    if shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::Space) {
        show_window(app, "pet");
    } else if shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyT) {
        show_window(app, "main");
        let _ = app.emit_to("main", "yuan://open-route", "/todos?quick=1");
    }
}

pub fn should_keep_running<R: Runtime>(app: &AppHandle<R>) -> bool {
    let state = app.state::<DesktopState>();
    !state.exiting.load(Ordering::SeqCst) && state.preferences().background_resident
}

pub fn exit_app<R: Runtime>(app: &AppHandle<R>) {
    quit(app);
}

#[tauri::command]
pub fn desktop_preferences(state: tauri::State<'_, DesktopState>) -> DesktopPreferences {
    state.preferences()
}

#[tauri::command]
pub fn set_background_resident(
    enabled: bool,
    state: tauri::State<'_, DesktopState>,
) -> Result<(), String> {
    state
        .value
        .lock()
        .map_err(|_| "桌面状态锁定失败")?
        .preferences
        .background_resident = enabled;
    if let Ok(item) = state.background_item.lock() {
        if let Some(item) = item.as_ref() {
            item.set_checked(enabled)
                .map_err(|error| error.to_string())?;
        }
    }
    state.save()
}

#[tauri::command]
pub fn set_shortcuts_enabled<R: Runtime>(enabled: bool, app: AppHandle<R>) -> Result<(), String> {
    let state = app.state::<DesktopState>();
    app.global_shortcut()
        .unregister_all()
        .map_err(|error| error.to_string())?;
    if enabled {
        let result = app
            .global_shortcut()
            .register(PET_SHORTCUT)
            .and_then(|_| app.global_shortcut().register(TODO_SHORTCUT));
        if let Err(error) = result {
            let _ = app.global_shortcut().unregister_all();
            return Err(format!("全局快捷键被其他应用占用：{error}"));
        }
    }
    state
        .value
        .lock()
        .map_err(|_| "桌面状态锁定失败")?
        .preferences
        .shortcuts_enabled = enabled;
    state.save()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offscreen_window_returns_to_available_work_area() {
        let areas = [WorkArea {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
            scale_factor: 1.0,
            name: None,
        }];
        let placement = WindowPlacement {
            x: 4000,
            y: 2000,
            width: 960,
            height: 640,
            scale_factor: 1.5,
            maximized: false,
            monitor_name: None,
        };
        let restored = clamp_placement(placement, &areas, (960, 640));
        assert_eq!((restored.x, restored.y), (960, 400));
    }

    #[test]
    fn placement_is_clamped_to_smaller_dpi_work_area() {
        let areas = [WorkArea {
            x: -1280,
            y: 0,
            width: 1280,
            height: 720,
            scale_factor: 1.25,
            name: Some("当前显示器".into()),
        }];
        let placement = WindowPlacement {
            x: -1200,
            y: 20,
            width: 1600,
            height: 900,
            scale_factor: 1.25,
            maximized: false,
            monitor_name: Some("当前显示器".into()),
        };
        let restored = clamp_placement(placement, &areas, (960, 640));
        assert_eq!(
            (restored.x, restored.y, restored.width, restored.height),
            (-1280, 0, 1280, 720)
        );
    }

    #[test]
    fn preserves_logical_size_and_offset_across_dpi_change() {
        let areas = [WorkArea {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            scale_factor: 1.0,
            name: Some("主显示器".into()),
        }];
        let placement = WindowPlacement {
            x: 150,
            y: 75,
            width: 1440,
            height: 960,
            scale_factor: 1.5,
            maximized: false,
            monitor_name: Some("主显示器".into()),
        };
        let restored = clamp_placement(placement, &areas, (640, 480));
        assert_eq!(
            (restored.x, restored.y, restored.width, restored.height),
            (100, 50, 960, 640)
        );
        assert_eq!(restored.scale_factor, 1.0);
    }
}
