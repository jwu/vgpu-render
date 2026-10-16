//! Offscreen reference renders for the bevy/ vgpu text comparison.
//!
//! Usage:
//!   CARGO_TARGET_DIR=<bevy>/target cargo run --release --offline -- <cases.json> <out-dir>
//!
//! Reads the shared case list, renders every case with bevy's own text stack onto
//! an image render target of the case's own size, and writes two artifacts per
//! case into `<out-dir>`:
//!
//!   bevy-<id>.png          the rendered frame
//!   bevy-<id>.glyphs.json  the glyph geometry `TextLayoutInfo` resolved, in
//!                          image pixel coordinates, so layout can be compared
//!                          numerically instead of only by eye
//!
//! The scene is deliberately thin: an orthographic camera whose projection is
//! exactly the case size (so one world unit is one pixel), `ClearColor` set to
//! the case background, and one `Text2d` per case with the components the case
//! names. Nothing in the port's own settings is mirrored here — the point is to
//! see what bevy does, not to make bevy agree with something.

use bevy::camera::{RenderTarget, ScalingMode};
use bevy::image::Image;
use bevy::prelude::*;
use bevy::render::render_resource::{PollType, TextureFormat};
use bevy::render::renderer::RenderDevice;
use bevy::render::view::screenshot::{save_to_disk, Screenshot};
use bevy::render::RenderPlugin;
use bevy::sprite::Anchor;
use bevy::text::{
    FontSize, Justify, LetterSpacing, LineBreak, LineHeight, TextBounds, TextLayoutInfo,
};
use bevy::window::ExitCondition;
use bevy::winit::WinitPlugin;
use serde::Deserialize;
use std::path::{Path, PathBuf};

const POLL_FRAMES: u32 = 4000;

#[derive(Deserialize)]
struct Spec {
    font: FontSpec,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct FontSpec {
    /// Font path relative to the repository root.
    ttf: String,
}

#[derive(Deserialize, Clone)]
struct Span {
    text: String,
    #[serde(default, rename = "fontSize")]
    font_size: Option<f32>,
    #[serde(default)]
    color: Option<[f32; 4]>,
}

#[derive(Deserialize, Clone)]
struct Case {
    id: String,
    width: u32,
    height: u32,
    background: [f32; 4],
    #[serde(rename = "fontSize")]
    font_size: f32,
    #[serde(default, rename = "lineHeight")]
    line_height: Option<f32>,
    #[serde(default, rename = "letterSpacing")]
    letter_spacing: Option<f32>,
    #[serde(default)]
    justify: Option<String>,
    #[serde(default, rename = "lineBreak")]
    line_break: Option<String>,
    /// `[width, height]`; a `null` entry leaves that axis unbounded.
    #[serde(default)]
    bounds: Option<[Option<f32>; 2]>,
    #[serde(default)]
    anchor: Option<String>,
    /// Anchor point, in top-left origin pixels.
    position: [f32; 2],
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    spans: Option<Vec<Span>>,
}

/// One app, pumped by hand, reused for every case.
struct Harness {
    sub_apps: bevy::app::SubApps,
    font: Handle<Font>,
}

impl Harness {
    fn new(font_path: &str) -> Self {
        let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .expect("repository root");
        let mut app = App::new();
        app.add_plugins(
            DefaultPlugins
                .set(AssetPlugin {
                    file_path: repo_root.to_string_lossy().into_owned(),
                    ..default()
                })
                .set(WindowPlugin {
                    primary_window: None,
                    exit_condition: ExitCondition::DontExit,
                    ..default()
                })
                .set(RenderPlugin {
                    // Every case renders a fresh pipeline set; compiling lazily would make the
                    // first frame of each case a blank target.
                    synchronous_pipeline_compilation: true,
                    ..default()
                })
                .disable::<WinitPlugin>(),
        );
        app.finish();
        app.cleanup();
        let mut sub_apps = std::mem::take(app.sub_apps_mut());
        let font = sub_apps
            .main
            .world()
            .resource::<AssetServer>()
            .load(font_path.to_owned());
        Self { sub_apps, font }
    }

    fn world(&mut self) -> &mut World {
        self.sub_apps.main.world_mut()
    }

    fn update(&mut self) {
        self.sub_apps.update();
        self.sub_apps
            .main
            .world()
            .resource::<RenderDevice>()
            .wgpu_device()
            .poll(PollType::Wait {
                submission_index: None,
                timeout: None,
            })
            .expect("device poll");
    }

    fn font_loaded(&self) -> bool {
        self.sub_apps
            .main
            .world()
            .resource::<Assets<Font>>()
            .get(&self.font)
            .is_some()
    }

    /// Pumps frames until `done` holds, or panics after `POLL_FRAMES`.
    fn pump_until(&mut self, what: &str, mut done: impl FnMut(&mut Self) -> bool) {
        for _ in 0..POLL_FRAMES {
            self.update();
            if done(self) {
                return;
            }
        }
        panic!("timed out waiting for {what}");
    }
}

fn anchor_of(name: &str) -> Anchor {
    match name {
        "top-left" => Anchor::TOP_LEFT,
        "top-center" => Anchor::TOP_CENTER,
        "top-right" => Anchor::TOP_RIGHT,
        "center-left" => Anchor::CENTER_LEFT,
        "center" => Anchor::CENTER,
        "center-right" => Anchor::CENTER_RIGHT,
        "bottom-left" => Anchor::BOTTOM_LEFT,
        "bottom-center" => Anchor::BOTTOM_CENTER,
        "bottom-right" => Anchor::BOTTOM_RIGHT,
        other => panic!("unknown anchor {other}"),
    }
}

fn justify_of(name: &str) -> Justify {
    match name {
        "left" => Justify::Left,
        "center" => Justify::Center,
        "right" => Justify::Right,
        "justified" => Justify::Justified,
        "start" => Justify::Start,
        "end" => Justify::End,
        other => panic!("unknown justify {other}"),
    }
}

fn line_break_of(name: &str) -> LineBreak {
    match name {
        "word" => LineBreak::WordBoundary,
        "character" => LineBreak::AnyCharacter,
        "word-or-character" => LineBreak::WordOrCharacter,
        "none" => LineBreak::NoWrap,
        other => panic!("unknown line break {other}"),
    }
}

fn color_of(rgba: [f32; 4]) -> Color {
    Color::srgba(rgba[0], rgba[1], rgba[2], rgba[3])
}

fn main() {
    let mut args = std::env::args().skip(1);
    let cases_path = args.next().unwrap_or_else(|| {
        eprintln!("usage: bevy-text-reference <cases.json> <out-dir>");
        std::process::exit(2);
    });
    let out_dir = PathBuf::from(args.next().unwrap_or_else(|| {
        eprintln!("usage: bevy-text-reference <cases.json> <out-dir>");
        std::process::exit(2);
    }));
    std::fs::create_dir_all(&out_dir).expect("output directory");

    let spec: Spec =
        serde_json::from_str(&std::fs::read_to_string(&cases_path).expect("cases file"))
            .expect("cases file parses");

    let mut harness = Harness::new(&spec.font.ttf);
    harness.pump_until("the bundled font", |h| h.font_loaded());

    for case in &spec.cases {
        render_case(&mut harness, case, &out_dir);
        println!("{}", case.id);
    }
}

fn render_case(harness: &mut Harness, case: &Case, out_dir: &Path) {
    let width = case.width as f32;
    let height = case.height as f32;

    let target = {
        let world = harness.world();
        let mut image =
            Image::new_target_texture(case.width, case.height, TextureFormat::Rgba8UnormSrgb, None);
        image.asset_usage = bevy::asset::RenderAssetUsages::RENDER_WORLD;
        world.resource_mut::<Assets<Image>>().add(image)
    };

    let font = harness.font.clone();
    let anchor = anchor_of(case.anchor.as_deref().unwrap_or("top-left"));
    let justify = justify_of(case.justify.as_deref().unwrap_or("left"));
    let line_break = line_break_of(case.line_break.as_deref().unwrap_or("word"));
    let anchor_vector = anchor.as_vec();
    // The camera's projection is exactly the case size, so world (0, 0) is the image centre and
    // image pixel (px, py) with a top-left origin is world (px - w/2, h/2 - py).
    let world_position = Vec3::new(
        case.position[0] - width / 2.0,
        height / 2.0 - case.position[1],
        0.0,
    );

    let mut bounds = TextBounds::UNBOUNDED;
    if let Some([w, h]) = case.bounds {
        if let Some(w) = w {
            bounds.width = Some(w);
        }
        if let Some(h) = h {
            bounds.height = Some(h);
        }
    }

    let line_height = match case.line_height {
        Some(value) => LineHeight::RelativeToFont(value),
        None => LineHeight::default(),
    };
    let letter_spacing = match case.letter_spacing {
        Some(value) => LetterSpacing::Px(value),
        None => LetterSpacing::default(),
    };

    let (root, camera) = {
        let world = harness.world();
        world.insert_resource(ClearColor(color_of(case.background)));
        let camera = world
            .spawn((
                Camera2d,
                RenderTarget::Image(target.clone().into()),
                Projection::Orthographic(OrthographicProjection {
                    scaling_mode: ScalingMode::Fixed { width, height },
                    ..OrthographicProjection::default_2d()
                }),
            ))
            .id();

        let base_text = match &case.spans {
            Some(spans) => spans
                .first()
                .map(|span| span.text.clone())
                .unwrap_or_default(),
            None => case.text.clone().unwrap_or_default(),
        };

        let root = world
            .spawn((
                Text2d::new(base_text),
                TextFont {
                    font: font.clone().into(),
                    font_size: FontSize::Px(case.font_size),
                    ..default()
                },
                TextColor(Color::WHITE),
                line_height,
                letter_spacing,
                TextLayout {
                    justify,
                    linebreak: line_break,
                },
                bounds,
                anchor,
                Transform::from_translation(world_position),
            ))
            .id();

        if let Some(spans) = &case.spans {
            for span in spans.iter().skip(1) {
                world.spawn((
                    TextSpan::new(span.text.clone()),
                    TextFont {
                        font: font.clone().into(),
                        font_size: FontSize::Px(span.font_size.unwrap_or(case.font_size)),
                        ..default()
                    },
                    TextColor(color_of(span.color.unwrap_or([1.0, 1.0, 1.0, 1.0]))),
                    line_height,
                    letter_spacing,
                    ChildOf(root),
                ));
            }
        }

        (root, camera)
    };

    harness.pump_until("text layout", |h| {
        h.sub_apps
            .main
            .world()
            .get::<TextLayoutInfo>(root)
            .is_some_and(|info| !info.glyphs.is_empty() || info.size.x > 0.0)
    });
    // Two more frames: one for the atlas texture to be uploaded, one for the sprite to be drawn.
    harness.update();
    harness.update();

    let png_path = out_dir.join(format!("bevy-{}.png", case.id));
    let glyphs_path = out_dir.join(format!("bevy-{}.glyphs.json", case.id));
    let _ = std::fs::remove_file(&png_path);
    write_glyphs(harness, root, case, &anchor_vector, &glyphs_path);

    {
        let world = harness.world();
        world
            .spawn(Screenshot::image(target.clone()))
            .observe(save_to_disk(png_path.clone()));
    }
    harness.pump_until("the screenshot", |_| png_path.exists());

    {
        let world = harness.world();
        world.despawn(root);
        world.despawn(camera);
        world.resource_mut::<Assets<Image>>().remove(&target);
    }
    // Give the render world a frame without the camera before the next case spawns its own.
    harness.update();
}

/// Dumps the glyph geometry `TextLayoutInfo` resolved, in image pixel coordinates.
///
/// `PositionedGlyph::position` is the glyph quad's centre in layout space (the block's
/// top-left, y down) scaled by the render target's scale factor. The block's top-left in image
/// pixels is the anchor point pulled back by `anchor * blockSize`, so the two compose into image
/// coordinates without involving the camera. That anchor rule is what `Text2d` itself uses when
/// it places a block (see `bevy_sprite_render::text2d`).
fn write_glyphs(harness: &mut Harness, root: Entity, case: &Case, anchor_vector: &Vec2, path: &Path) {
    let world = harness.world();
    let info = world
        .get::<TextLayoutInfo>(root)
        .expect("layout info after pumping");
    let scale = info.scale_factor;
    let size = info.size / scale;

    // Anchor::TOP_LEFT is (-0.5, 0.5) in this version's y-up normalized space; the block's
    // top-left is `anchor` moved by that offset across the block size.
    let top_left_offset = Vec2::new(
        (-0.5 - anchor_vector.x) * size.x,
        (0.5 - anchor_vector.y) * size.y,
    );
    let origin_x = case.position[0] + top_left_offset.x;
    let origin_y = case.position[1] - top_left_offset.y;

    let glyphs: Vec<serde_json::Value> = info
        .glyphs
        .iter()
        .map(|glyph| {
            let centre = glyph.position / scale;
            let rect = glyph.atlas_info.rect.size() / scale;
            serde_json::json!({
                "section": glyph.section_index,
                "line": glyph.line_index,
                "x": origin_x + centre.x,
                "y": origin_y + centre.y,
                "w": rect.x,
                "h": rect.y,
                "left": origin_x + centre.x - rect.x / 2.0,
                "top": origin_y + centre.y - rect.y / 2.0,
            })
        })
        .collect();

    let payload = serde_json::json!({
        "id": case.id,
        "scaleFactor": scale,
        "blockWidth": size.x,
        "blockHeight": size.y,
        "origin": [origin_x, origin_y],
        "glyphs": glyphs,
    });
    let text = serde_json::to_string_pretty(&payload).expect("glyph json");
    std::fs::write(path, text).expect("write glyph json");
}
