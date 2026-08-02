#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use eframe::egui::{
    self, Align, Color32, FontData, FontDefinitions, FontFamily, FontId, Frame, Layout, Margin,
    RichText, Stroke, TextStyle, Vec2,
};
use llm_api_doctor_core::{report_json, report_markdown, Config, Provider, Report};
use std::fs;
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, TryRecvError};
use std::thread;
use std::time::Duration;

const PAGE_BG: Color32 = Color32::from_rgb(244, 246, 243);
const SURFACE: Color32 = Color32::from_rgb(255, 255, 255);
const SURFACE_SOFT: Color32 = Color32::from_rgb(247, 249, 247);
const HEADER: Color32 = Color32::from_rgb(24, 33, 29);
const TEXT: Color32 = Color32::from_rgb(28, 37, 33);
const MUTED: Color32 = Color32::from_rgb(104, 115, 109);
const BORDER: Color32 = Color32::from_rgb(217, 223, 219);
const BORDER_STRONG: Color32 = Color32::from_rgb(198, 206, 201);
const ACCENT: Color32 = Color32::from_rgb(8, 127, 91);
const ACCENT_STRONG: Color32 = Color32::from_rgb(5, 102, 71);
const PASS: Color32 = Color32::from_rgb(22, 128, 93);
const WARN: Color32 = Color32::from_rgb(173, 106, 0);
const FAIL: Color32 = Color32::from_rgb(195, 60, 67);

fn main() -> eframe::Result {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1120.0, 720.0])
            .with_min_inner_size([860.0, 580.0]),
        ..Default::default()
    };
    eframe::run_native(
        "LLM API Doctor",
        options,
        Box::new(|cc| {
            install_fonts(&cc.egui_ctx);
            install_style(&cc.egui_ctx);
            Ok(Box::new(App::default()))
        }),
    )
}

fn install_fonts(ctx: &egui::Context) {
    let mut fonts = FontDefinitions::default();
    let candidates = [
        ("segoe-ui", r"C:\Windows\Fonts\segoeui.ttf"),
        ("noto-sans-sc", r"C:\Windows\Fonts\NotoSansSC-VF.ttf"),
        ("dengxian", r"C:\Windows\Fonts\Deng.ttf"),
    ];

    for (name, path) in candidates {
        if let Ok(bytes) = fs::read(path) {
            fonts
                .font_data
                .insert(name.to_string(), FontData::from_owned(bytes).into());
        }
    }

    let proportional = fonts.families.entry(FontFamily::Proportional).or_default();
    for name in ["dengxian", "noto-sans-sc", "segoe-ui"] {
        if fonts.font_data.contains_key(name) {
            proportional.insert(0, name.to_string());
        }
    }
    if fonts.font_data.contains_key("noto-sans-sc") {
        fonts
            .families
            .entry(FontFamily::Monospace)
            .or_default()
            .push("noto-sans-sc".to_string());
    }
    ctx.set_fonts(fonts);
}

fn install_style(ctx: &egui::Context) {
    let mut style = (*ctx.style()).clone();
    style.text_styles = [
        (TextStyle::Heading, FontId::proportional(20.0)),
        (TextStyle::Body, FontId::proportional(13.0)),
        (TextStyle::Button, FontId::proportional(13.0)),
        (TextStyle::Small, FontId::proportional(11.0)),
        (TextStyle::Monospace, FontId::monospace(11.0)),
    ]
    .into();
    style.spacing.item_spacing = Vec2::new(8.0, 8.0);
    style.spacing.button_padding = Vec2::new(10.0, 7.0);
    style.spacing.interact_size.y = 38.0;
    style.visuals = egui::Visuals::light();
    style.visuals.panel_fill = PAGE_BG;
    style.visuals.window_fill = SURFACE;
    style.visuals.extreme_bg_color = SURFACE_SOFT;
    style.visuals.override_text_color = Some(TEXT);
    style.visuals.selection.bg_fill = ACCENT;
    style.visuals.hyperlink_color = ACCENT;
    for widget in [
        &mut style.visuals.widgets.inactive,
        &mut style.visuals.widgets.hovered,
        &mut style.visuals.widgets.active,
        &mut style.visuals.widgets.open,
    ] {
        widget.corner_radius = egui::CornerRadius::same(5);
    }
    style.visuals.widgets.inactive.bg_fill = Color32::from_rgb(251, 252, 251);
    style.visuals.widgets.inactive.weak_bg_fill = SURFACE;
    style.visuals.widgets.inactive.bg_stroke = Stroke::new(1.0_f32, BORDER_STRONG);
    style.visuals.widgets.hovered.bg_fill = Color32::from_rgb(245, 251, 248);
    style.visuals.widgets.hovered.bg_stroke = Stroke::new(1.0_f32, ACCENT);
    style.visuals.widgets.active.bg_fill = Color32::from_rgb(232, 244, 238);
    style.visuals.widgets.active.bg_stroke = Stroke::new(1.0_f32, ACCENT);
    ctx.set_style(style);
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ResultTab {
    Checks,
    Report,
}

struct App {
    provider: Provider,
    base_url: String,
    model: String,
    api_key: String,
    api_version: String,
    timeout: u64,
    stream: bool,
    show_key: bool,
    report: Option<Report>,
    tab: ResultTab,
    error: String,
    notice: String,
    running: bool,
    receiver: Option<Receiver<Result<Report, String>>>,
}

impl Default for App {
    fn default() -> Self {
        Self {
            provider: Provider::OpenAiCompatible,
            base_url: String::new(),
            model: String::new(),
            api_key: String::new(),
            api_version: String::new(),
            timeout: 30,
            stream: false,
            show_key: false,
            report: None,
            tab: ResultTab::Checks,
            error: String::new(),
            notice: String::new(),
            running: false,
            receiver: None,
        }
    }
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.poll_run();
        if self.running {
            ctx.request_repaint_after(Duration::from_millis(100));
        }

        self.header(ctx);
        self.configuration_panel(ctx);
        self.results_panel(ctx);
    }
}

impl App {
    fn header(&mut self, ctx: &egui::Context) {
        egui::TopBottomPanel::top("app_header")
            .exact_height(58.0)
            .frame(
                Frame::new()
                    .fill(HEADER)
                    .inner_margin(Margin::symmetric(22, 12)),
            )
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    square_mark(
                        ui,
                        34.0,
                        "+",
                        23.0,
                        ACCENT_STRONG,
                        Color32::from_rgb(229, 245, 238),
                    );
                    ui.vertical(|ui| {
                        ui.label(
                            RichText::new("LLM API Doctor")
                                .size(17.0)
                                .strong()
                                .color(Color32::WHITE),
                        );
                        ui.label(
                            RichText::new("DESKTOP")
                                .size(10.0)
                                .color(Color32::from_rgb(174, 185, 179)),
                        );
                    });
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        ui.label(
                            RichText::new("✓  Local session / 本地会话")
                                .size(12.0)
                                .color(Color32::from_rgb(201, 211, 206)),
                        );
                    });
                });
            });
    }

    fn configuration_panel(&mut self, ctx: &egui::Context) {
        egui::SidePanel::left("configuration")
            .exact_width(356.0)
            .resizable(false)
            .frame(
                Frame::new()
                    .fill(SURFACE)
                    .stroke(Stroke::new(1.0_f32, BORDER))
                    .inner_margin(Margin::symmetric(24, 20)),
            )
            .show(ctx, |ui| {
                self.configuration_heading(ui);
                ui.add_space(18.0);
                self.configuration_form(ui);
                ui.add_space(24.0);
                ui.label(
                    RichText::new("✓  API key is not persisted / API Key 不会被保存")
                        .size(11.0)
                        .color(MUTED),
                );
            });
    }

    fn configuration_heading(&mut self, ui: &mut egui::Ui) {
        ui.with_layout(Layout::right_to_left(Align::TOP), |ui| {
            let reset = ui
                .add_enabled(
                    !self.running,
                    egui::Button::new(RichText::new("↻").size(18.0).color(MUTED))
                        .min_size(Vec2::splat(34.0)),
                )
                .on_hover_text("Reset report and API key / 重置报告和密钥");
            if reset.clicked() {
                self.report = None;
                self.api_key.clear();
                self.error.clear();
                self.notice.clear();
            }
            ui.with_layout(Layout::left_to_right(Align::TOP), |ui| {
                ui.vertical(|ui| {
                    ui.label(
                        RichText::new("CONFIGURATION")
                            .size(11.0)
                            .strong()
                            .color(ACCENT),
                    );
                    ui.label(
                        RichText::new("Connection / 连接配置")
                            .size(20.0)
                            .strong()
                            .color(TEXT),
                    );
                });
            });
        });
    }

    fn configuration_form(&mut self, ui: &mut egui::Ui) {
        ui.spacing_mut().item_spacing.y = 9.0;

        field_label(ui, "▣", "Provider protocol / 服务商协议");
        let previous_provider = self.provider;
        ui.add_enabled_ui(!self.running, |ui| {
            egui::ComboBox::from_id_salt("provider")
                .width(ui.available_width())
                .selected_text(provider_label(self.provider))
                .show_ui(ui, |ui| {
                    for provider in [
                        Provider::OpenAiCompatible,
                        Provider::OpenAiResponses,
                        Provider::Anthropic,
                        Provider::Gemini,
                        Provider::AzureOpenAi,
                    ] {
                        ui.selectable_value(&mut self.provider, provider, provider_label(provider));
                    }
                });
        });
        if previous_provider != self.provider {
            self.apply_provider_defaults(previous_provider);
        }
        ui.add_space(5.0);

        field_label(ui, "◎", "API base URL");
        ui.add_enabled(
            !self.running,
            egui::TextEdit::singleline(&mut self.base_url)
                .desired_width(f32::INFINITY)
                .hint_text("https://api.example.com/v1"),
        );
        ui.add_space(5.0);

        if matches!(self.provider, Provider::Anthropic | Provider::AzureOpenAi) {
            field_label(ui, "◈", "API version");
            let hint = if self.provider == Provider::AzureOpenAi {
                "2024-10-21"
            } else {
                "2023-06-01"
            };
            ui.add_enabled(
                !self.running,
                egui::TextEdit::singleline(&mut self.api_version)
                    .desired_width(f32::INFINITY)
                    .hint_text(hint),
            );
            ui.add_space(5.0);
        }

        field_label(ui, "◈", "Model ID / 模型 ID");
        ui.add_enabled(
            !self.running,
            egui::TextEdit::singleline(&mut self.model)
                .desired_width(f32::INFINITY)
                .hint_text("model-id"),
        );
        ui.add_space(5.0);

        field_label(ui, "◆", "API key / API 密钥");
        ui.horizontal(|ui| {
            let button_width = 42.0;
            let input_width = (ui.available_width() - button_width - 4.0).max(120.0);
            ui.add_enabled(
                !self.running,
                egui::TextEdit::singleline(&mut self.api_key)
                    .password(!self.show_key)
                    .desired_width(input_width)
                    .hint_text("Enter API key"),
            );
            if ui
                .add_enabled(
                    !self.running,
                    egui::Button::new(if self.show_key { "Hide" } else { "Show" })
                        .min_size(Vec2::new(button_width, 38.0)),
                )
                .clicked()
            {
                self.show_key = !self.show_key;
            }
        });
        ui.add_space(7.0);

        ui.columns(2, |columns| {
            field_label(&mut columns[0], "◷", "Timeout / 超时");
            columns[0].horizontal(|ui| {
                ui.add_enabled(
                    !self.running,
                    egui::DragValue::new(&mut self.timeout).range(1..=300),
                );
                ui.label(RichText::new("sec").size(12.0).color(MUTED));
            });

            field_label(&mut columns[1], "", "Streaming / 流式响应");
            columns[1].horizontal(|ui| {
                let response = toggle_switch(ui, &mut self.stream, !self.running);
                ui.label(if self.stream { "On / 开" } else { "Off / 关" });
                response.on_hover_text("Test SSE streaming / 测试 SSE 流式协议");
            });
        });

        if !self.error.is_empty() {
            ui.add_space(8.0);
            message_box(ui, &self.error, FAIL, Color32::from_rgb(255, 245, 245));
        }
        if !self.notice.is_empty() {
            ui.add_space(8.0);
            message_box(ui, &self.notice, PASS, Color32::from_rgb(240, 250, 245));
        }

        ui.add_space(10.0);
        let label = if self.running {
            "■  Stop diagnostic / 停止诊断"
        } else {
            "▶  Run diagnostic / 开始诊断"
        };
        let (fill, stroke) = if self.running {
            (
                Color32::from_rgb(255, 244, 244),
                Color32::from_rgb(227, 175, 178),
            )
        } else {
            (ACCENT, ACCENT)
        };
        let text_color = if self.running { FAIL } else { Color32::WHITE };
        let button = egui::Button::new(RichText::new(label).strong().color(text_color))
            .fill(fill)
            .stroke(Stroke::new(1.0_f32, stroke))
            .corner_radius(5);
        if ui.add_sized([ui.available_width(), 42.0], button).clicked() {
            if self.running {
                self.receiver = None;
                self.running = false;
                self.notice = "Diagnostic run cancelled / 诊断已取消".to_string();
            } else {
                self.start_run();
            }
        }
    }

    fn results_panel(&mut self, ctx: &egui::Context) {
        egui::CentralPanel::default()
            .frame(
                Frame::new()
                    .fill(PAGE_BG)
                    .inner_margin(Margin::symmetric(32, 28)),
            )
            .show(ctx, |ui| {
                if self.running && self.report.is_none() {
                    self.running_state(ui);
                } else if let Some(report) = self.report.clone() {
                    egui::ScrollArea::vertical()
                        .auto_shrink([false, false])
                        .show(ui, |ui| self.report_view(ui, &report));
                } else {
                    self.empty_state(ui);
                }
            });
    }

    fn empty_state(&self, ui: &mut egui::Ui) {
        ui.add_space((ui.available_height() * 0.30).max(100.0));
        ui.vertical_centered(|ui| {
            square_mark(
                ui,
                62.0,
                "+",
                30.0,
                ACCENT,
                Color32::from_rgb(232, 244, 238),
            );
            ui.add_space(12.0);
            ui.label(
                RichText::new("No diagnostic report / 暂无诊断报告")
                    .size(18.0)
                    .strong()
                    .color(Color32::from_rgb(51, 64, 57)),
            );
            ui.label(
                RichText::new("Connection results will appear here. / 连接测试结果将在此显示")
                    .size(13.0)
                    .color(MUTED),
            );
        });
    }

    fn running_state(&self, ui: &mut egui::Ui) {
        ui.add_space((ui.available_height() * 0.28).max(90.0));
        ui.vertical_centered(|ui| {
            square_mark(
                ui,
                62.0,
                "…",
                25.0,
                ACCENT,
                Color32::from_rgb(232, 244, 238),
            );
            ui.add_space(12.0);
            ui.label(
                RichText::new("Diagnostic in progress / 正在诊断")
                    .size(18.0)
                    .strong(),
            );
            ui.label(
                RichText::new("Waiting for the API response... / 正在等待 API 响应")
                    .size(13.0)
                    .color(MUTED),
            );
            ui.add_space(18.0);
            ui.add(
                egui::ProgressBar::new(0.55)
                    .animate(true)
                    .desired_width(300.0),
            );
        });
    }

    fn report_view(&mut self, ui: &mut egui::Ui, report: &Report) {
        let (passed, warned, failed) = result_counts(report);
        let overall = if failed > 0 {
            "FAIL / 失败"
        } else if warned > 0 {
            "WARN / 警告"
        } else {
            "PASS / 通过"
        };
        let overall_color = if failed > 0 {
            FAIL
        } else if warned > 0 {
            WARN
        } else {
            PASS
        };

        ui.horizontal(|ui| {
            ui.vertical(|ui| {
                ui.label(
                    RichText::new(format!("●  {overall}"))
                        .size(12.0)
                        .strong()
                        .color(overall_color),
                );
                ui.add_space(4.0);
                ui.label(RichText::new(&report.model).size(22.0).strong().color(TEXT));
                ui.label(
                    RichText::new(format!(
                        "{} · {}",
                        report.provider.as_str(),
                        report.endpoint
                    ))
                    .family(FontFamily::Monospace)
                    .size(11.0)
                    .color(MUTED),
                );
            });
            ui.with_layout(Layout::right_to_left(Align::TOP), |ui| {
                if ui.button("▤  Markdown").clicked() {
                    self.export_report(report, "markdown");
                }
                if ui.button("{}  JSON").clicked() {
                    self.export_report(report, "json");
                }
            });
        });

        ui.add_space(20.0);
        Frame::new()
            .fill(SURFACE)
            .stroke(Stroke::new(1.0_f32, BORDER))
            .corner_radius(6)
            .show(ui, |ui| {
                ui.set_min_height(66.0);
                ui.columns(5, |columns| {
                    stat(&mut columns[0], "Passed / 通过", &passed.to_string(), PASS);
                    stat(
                        &mut columns[1],
                        "Warnings / 警告",
                        &warned.to_string(),
                        WARN,
                    );
                    stat(&mut columns[2], "Failed / 失败", &failed.to_string(), FAIL);
                    stat(
                        &mut columns[3],
                        "Checks / 检查",
                        &report.results.len().to_string(),
                        TEXT,
                    );
                    stat(
                        &mut columns[4],
                        "Latency / 耗时",
                        &format_duration(max_duration(report)),
                        TEXT,
                    );
                });
            });

        ui.add_space(16.0);
        ui.horizontal(|ui| {
            if ui
                .selectable_label(self.tab == ResultTab::Checks, "Checks / 检查")
                .clicked()
            {
                self.tab = ResultTab::Checks;
            }
            if ui
                .selectable_label(self.tab == ResultTab::Report, "Report / 报告")
                .clicked()
            {
                self.tab = ResultTab::Report;
            }
        });
        ui.separator();
        ui.add_space(4.0);

        match self.tab {
            ResultTab::Checks => self.result_list(ui, report),
            ResultTab::Report => {
                Frame::new()
                    .fill(SURFACE)
                    .stroke(Stroke::new(1.0_f32, BORDER))
                    .corner_radius(6)
                    .inner_margin(Margin::same(16))
                    .show(ui, |ui| {
                        ui.label(
                            RichText::new("JSON report / JSON 报告")
                                .size(12.0)
                                .strong()
                                .color(MUTED),
                        );
                        ui.separator();
                        ui.monospace(report_json(report));
                    });
            }
        }
    }

    fn result_list(&self, ui: &mut egui::Ui, report: &Report) {
        Frame::new()
            .fill(SURFACE)
            .stroke(Stroke::new(1.0_f32, BORDER))
            .corner_radius(6)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                for (index, item) in report.results.iter().enumerate() {
                    if index > 0 {
                        ui.separator();
                    }
                    Frame::new()
                        .inner_margin(Margin::symmetric(16, 12))
                        .show(ui, |ui| {
                            ui.horizontal_top(|ui| {
                                let color = status_color(&item.status);
                                ui.label(
                                    RichText::new(status_symbol(&item.status))
                                        .size(18.0)
                                        .color(color),
                                );
                                ui.vertical(|ui| {
                                    ui.horizontal(|ui| {
                                        ui.vertical(|ui| {
                                            ui.label(
                                                RichText::new(&item.name)
                                                    .size(13.0)
                                                    .strong()
                                                    .color(Color32::from_rgb(44, 55, 49)),
                                            );
                                            ui.label(
                                                RichText::new(result_name_zh(&item.id))
                                                    .size(11.0)
                                                    .color(MUTED),
                                            );
                                        });
                                        ui.with_layout(Layout::right_to_left(Align::TOP), |ui| {
                                            if item.duration_ms > 0.0 {
                                                ui.label(
                                                    RichText::new(format_duration(
                                                        item.duration_ms,
                                                    ))
                                                    .size(11.0)
                                                    .color(MUTED),
                                                );
                                            }
                                        });
                                    });
                                    ui.label(RichText::new(&item.message).size(12.0).color(MUTED));
                                    ui.label(
                                        RichText::new(result_message_zh(&item.id, &item.status))
                                            .size(12.0)
                                            .color(Color32::from_rgb(63, 106, 89)),
                                    );
                                    if let Some(suggestion) = &item.suggestion {
                                        ui.add_space(3.0);
                                        ui.label(
                                            RichText::new(format!(
                                                "Suggestion / 建议: {suggestion}"
                                            ))
                                            .size(11.0)
                                            .color(WARN),
                                        );
                                    }
                                });
                            });
                        });
                }
            });
    }

    fn start_run(&mut self) {
        self.error.clear();
        self.notice.clear();
        let base_url = if self.base_url.trim().is_empty() {
            self.provider.default_base_url().unwrap_or("").to_string()
        } else {
            self.base_url.trim().to_string()
        };
        if base_url.is_empty() || self.model.trim().is_empty() || self.api_key.trim().is_empty() {
            self.error = "API base URL, model ID, and API key are required. / 请填写 API 地址、模型 ID 和 API Key。".to_string();
            return;
        }
        let config = Config {
            provider: self.provider,
            base_url,
            model: self.model.trim().to_string(),
            api_key: self.api_key.trim().to_string(),
            api_version: (!self.api_version.trim().is_empty())
                .then(|| self.api_version.trim().to_string()),
            timeout_seconds: self.timeout,
            stream: self.stream,
        };
        let (sender, receiver) = mpsc::channel();
        thread::spawn(move || {
            let result = llm_api_doctor_core::run(&config).map_err(|error| error.to_string());
            let _ = sender.send(result);
        });
        self.receiver = Some(receiver);
        self.report = None;
        self.tab = ResultTab::Checks;
        self.running = true;
        self.api_key.clear();
    }

    fn poll_run(&mut self) {
        let result = match self.receiver.as_ref().map(Receiver::try_recv) {
            Some(Ok(result)) => Some(result),
            Some(Err(TryRecvError::Disconnected)) => {
                Some(Err("Diagnostic worker stopped unexpectedly.".to_string()))
            }
            _ => None,
        };
        if let Some(result) = result {
            self.receiver = None;
            self.running = false;
            match result {
                Ok(report) => self.report = Some(report),
                Err(error) => self.error = error,
            }
        }
    }

    fn apply_provider_defaults(&mut self, previous: Provider) {
        let previous_default = previous.default_base_url().unwrap_or("");
        if self.base_url.is_empty() || self.base_url == previous_default {
            self.base_url = self.provider.default_base_url().unwrap_or("").to_string();
        }
        self.api_version = match self.provider {
            Provider::Anthropic => "2023-06-01".to_string(),
            Provider::AzureOpenAi => "2024-10-21".to_string(),
            _ => String::new(),
        };
    }

    fn export_report(&mut self, report: &Report, format: &str) {
        let (file_name, content) = if format == "json" {
            ("llm-api-doctor-report.json", report_json(report))
        } else {
            ("llm-api-doctor-report.md", report_markdown(report))
        };
        let mut path = std::env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        path.push("Downloads");
        if !path.is_dir() {
            path = PathBuf::from(".");
        }
        path.push(file_name);
        match fs::write(&path, content) {
            Ok(()) => self.notice = format!("Report saved / 报告已保存: {}", path.display()),
            Err(error) => self.error = format!("Unable to export report: {error}"),
        }
    }
}

fn provider_label(provider: Provider) -> &'static str {
    match provider {
        Provider::OpenAiCompatible => "OpenAI-compatible",
        Provider::OpenAiResponses => "OpenAI Responses",
        Provider::Anthropic => "Anthropic Messages",
        Provider::Gemini => "Google Gemini",
        Provider::AzureOpenAi => "Azure OpenAI",
    }
}

fn square_mark(
    ui: &mut egui::Ui,
    size: f32,
    glyph: &str,
    glyph_size: f32,
    color: Color32,
    background: Color32,
) {
    let (rect, _) = ui.allocate_exact_size(Vec2::splat(size), egui::Sense::hover());
    ui.painter().rect_filled(rect, 7.0, background);
    ui.painter().text(
        rect.center(),
        egui::Align2::CENTER_CENTER,
        glyph,
        FontId::proportional(glyph_size),
        color,
    );
}

fn field_label(ui: &mut egui::Ui, icon: &str, label: &str) {
    let text = if icon.is_empty() {
        label.to_string()
    } else {
        format!("{icon}  {label}")
    };
    ui.label(
        RichText::new(text)
            .size(12.0)
            .strong()
            .color(Color32::from_rgb(69, 80, 73)),
    );
}

fn toggle_switch(ui: &mut egui::Ui, value: &mut bool, enabled: bool) -> egui::Response {
    let size = Vec2::new(38.0, 22.0);
    let (rect, mut response) = ui.allocate_exact_size(size, egui::Sense::click());
    if enabled && response.clicked() {
        *value = !*value;
        response.mark_changed();
    }
    let background = if *value {
        ACCENT
    } else {
        Color32::from_rgb(201, 208, 204)
    };
    let background = if enabled {
        background
    } else {
        background.gamma_multiply(0.65)
    };
    ui.painter().rect_filled(rect, 11.0, background);
    let x = if *value {
        rect.right() - 11.0
    } else {
        rect.left() + 11.0
    };
    ui.painter()
        .circle_filled(egui::pos2(x, rect.center().y), 8.0, Color32::WHITE);
    response
}

fn message_box(ui: &mut egui::Ui, message: &str, color: Color32, background: Color32) {
    Frame::new()
        .fill(background)
        .stroke(Stroke::new(1.0_f32, color.gamma_multiply(0.45)))
        .corner_radius(5)
        .inner_margin(Margin::same(10))
        .show(ui, |ui| {
            ui.label(RichText::new(message).size(12.0).color(color));
        });
}

fn result_counts(report: &Report) -> (usize, usize, usize) {
    let pass = report
        .results
        .iter()
        .filter(|item| item.status == "pass")
        .count();
    let warn = report
        .results
        .iter()
        .filter(|item| item.status == "warn")
        .count();
    let fail = report
        .results
        .iter()
        .filter(|item| item.status == "fail")
        .count();
    (pass, warn, fail)
}

fn stat(ui: &mut egui::Ui, label: &str, value: &str, color: Color32) {
    Frame::new()
        .inner_margin(Margin::symmetric(12, 10))
        .show(ui, |ui| {
            ui.label(RichText::new(label).size(11.0).color(MUTED));
            ui.label(RichText::new(value).size(17.0).strong().color(color));
        });
}

fn max_duration(report: &Report) -> f64 {
    report
        .results
        .iter()
        .map(|item| item.duration_ms)
        .fold(0.0, f64::max)
}

fn format_duration(value: f64) -> String {
    if value <= 0.0 {
        "--".to_string()
    } else if value >= 1000.0 {
        format!("{:.2} s", value / 1000.0)
    } else {
        format!("{value:.0} ms")
    }
}

fn status_color(status: &str) -> Color32 {
    match status {
        "pass" => PASS,
        "warn" => WARN,
        "fail" => FAIL,
        _ => MUTED,
    }
}

fn status_symbol(status: &str) -> &'static str {
    match status {
        "pass" => "✓",
        "warn" => "!",
        "fail" => "×",
        _ => "−",
    }
}

fn result_name_zh(id: &str) -> &'static str {
    match id {
        "url.normalization" => "API 端点",
        "chat.http" => "非流式 HTTP 请求",
        "chat.content_type" => "非流式内容类型",
        "chat.schema" => "响应结构",
        "chat.content" => "模型文本响应",
        "chat.usage" => "Token 使用量元数据",
        "stream.http" => "流式 HTTP 请求",
        "stream.content_type" => "流式内容类型",
        "stream.protocol" => "SSE 协议",
        "stream.content" => "流式文本响应",
        "stream.termination" => "流式结束标记",
        "stream.timing" => "流式延迟",
        _ => "诊断检查",
    }
}

fn result_message_zh(id: &str, status: &str) -> &'static str {
    match (id, status) {
        ("url.normalization", _) => "API 地址已完成规范化。",
        ("chat.http", "pass") => "服务端成功返回非流式 HTTP 响应。",
        ("chat.content_type", "pass") => "响应内容类型符合 JSON 规范。",
        ("chat.schema", "pass") => "响应包含当前协议要求的必要字段。",
        ("chat.content", "pass") => "模型返回了非空文本内容。",
        ("stream.http", "pass") => "服务端成功建立流式响应。",
        ("stream.protocol", "pass") => "SSE 数据事件解析成功。",
        ("stream.content", "pass") => "流式响应产生了非空文本。",
        ("stream.termination", "pass") => "流式响应按协议正常结束。",
        ("stream.timing", _) => "已记录响应头、首 Token 和总耗时。",
        (_, "warn") => "此项存在兼容性警告，请查看英文详情。",
        (_, "fail") => "此项检查失败，请查看英文错误和建议。",
        _ => "检查已完成。",
    }
}
