extends SceneTree

var scene: Node
var ticks := 0
var output_path: String

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var scene_id := args[0] if args.size() > 0 else "circle"
	output_path = args[1] if args.size() > 1 else "/tmp/godot-circle.png"
	scene = load("res://examples/%s.tscn" % scene_id).instantiate()
	root.add_child(scene)
	current_scene = scene
	configure.call_deferred()

func configure() -> void:
	root.size = Vector2i(1920, 1080)
	root.content_scale_size = Vector2i(1920, 1080)
	var camera := scene.get_node("FreeCamera") as Camera3D
	camera.set_process(false)
	camera.set_process_input(false)
	# Translate only; preserve all reference primitive dimensions.
	scene.position = Vector3(-10, 0, 1.5)
	camera.global_position = Vector3(8, 16, 21.5)
	camera.look_at(Vector3.ZERO)
	camera.fov = 75.0
	camera.near = 0.05
	camera.far = 100.0
	print("CAPTURE_CAMERA eye=", camera.global_position, " basis=", camera.global_basis, " viewport=", root.size)
	scene.set_process(false)

func _process(_delta: float) -> bool:
	ticks += 1
	if scene.has_method("_process"):
		scene.call("_process", 0.0)
	if ticks == 10:
		capture.call_deferred()
	return false

func capture() -> void:
	await RenderingServer.frame_post_draw
	var result := root.get_texture().get_image().save_png(output_path)
	print("BASELINE_CAPTURE ", output_path, " result=", result)
	quit(result)
