extends SceneTree

# Text-rendering reference capture.
#
# Draws one string with one face twice — once as a grayscale raster and once as MSDF — so the two can
# be measured the way `docs/visual-comparison.md` measures them. The MSDF comes from the msdfgen
# build Godot vendors in `thirdparty/msdfgen`, which makes this the closest thing to a reference
# implementation the project has for distance-field text.
#
# Usage:
#   godot --path <project-dir> --display-driver x11 --audio-driver Dummy \
#     --script scripts/capture-godot-text.gd -- <font.ttf> <out.png> [font size]
#
# `<project-dir>` only needs a `project.godot`; the drawing happens in an offscreen `SubViewport`, so
# the window size a compositor hands out cannot change the capture. `docs/visual-comparison.md`
# records the parameters the numbers in this repository were taken with.

const SAMPLE := "Handgloves 0123"
const PAGE := Vector2i(1920, 1080)
const BACKGROUND := Color(30.0 / 255.0, 30.0 / 255.0, 30.0 / 255.0, 1.0)
const LABEL_COLOR := Color(0.7, 0.85, 1, 1)
const TEXT_COLOR := Color(1, 1, 1, 1)

class Board:
	extends Node2D
	var rows: Array = []

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, Vector2(PAGE)), BACKGROUND)
		for row in rows:
			draw_string(row.label_font, Vector2(24, row.y - 10), row.label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, LABEL_COLOR)
			draw_string(row.font, Vector2(200, row.y), SAMPLE, HORIZONTAL_ALIGNMENT_LEFT, -1, row.size, TEXT_COLOR)

var font_path := ""
var out_path := "/tmp/godot-text.png"
var font_size := 20
var viewport: SubViewport
var ticks := 0

func make_font(msdf: bool) -> FontFile:
	var font := FontFile.new()
	font.load_dynamic_font(font_path)
	# Hinting and subpixel placement are off on purpose: the library's own encodings rebuild the edge
	# from a distance and never fit it to the grid, so leaving them on would compare two things at once.
	font.antialiasing = TextServer.FONT_ANTIALIASING_GRAY
	font.hinting = TextServer.HINTING_NONE
	font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
	if msdf:
		font.multichannel_signed_distance_field = true
		font.msdf_pixel_range = 8
		font.msdf_size = 48
	return font

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	font_path = args[0] if args.size() > 0 else ""
	if args.size() > 1:
		out_path = args[1]
	if args.size() > 2:
		font_size = int(args[2])
	viewport = SubViewport.new()
	viewport.size = PAGE
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var label_font := make_font(false)
	var board := Board.new()
	board.rows = [
		{"font": make_font(false), "label_font": label_font, "label": "grayscale raster", "y": 60, "size": font_size},
		{"font": make_font(true), "label_font": label_font, "label": "msdf range=8 size=48", "y": 120, "size": font_size},
	]
	viewport.add_child(board)

func _process(_delta: float) -> bool:
	ticks += 1
	if ticks == 10:
		capture.call_deferred()
	return false

func capture() -> void:
	await RenderingServer.frame_post_draw
	var image := viewport.get_texture().get_image()
	var err := image.save_png(out_path)
	print("CAPTURE ", out_path, " size=", image.get_size(), " err=", err)
	quit(err)
