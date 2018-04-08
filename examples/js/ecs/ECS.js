
class Ecs {

}

class Entity {

}

class Component {

}

class System {

	constructor() {
		this._ecs = null;
	}

	setEcs(orchestrator) {
		this._ecs = orchestrator;
		this._entities = orchestrator.entities;
	}

}

class Hierarchy {

}

class ComponentQuery {

}

class Channel {

}

class SameThreadChannel {

	constructor(ecs) {
		this._ecs = ecs;
	}

	getComponent(...args) {
		return ecs.getComponent(...args)
	}

	addComponent(...args) {
		return ecs.addComponent(...args)
	}

	updateComponent(...args) {
		return ecs.updateComponent(...args)
	}

}

class CartesianSpace extends System {

	constructor() {
		super();
		this.threeNodes = new Map();
		this._threeScene = new THREE.Scene();
	}

	init() {
		this._ecs.observeEntities(
			this._entities.changing(Position, Rotation, Scale),
			this._updateNodes, this
		);
		this._ecs.observeHierarchy(
			'default',
			this._buildScene, this
		);
	}

	getThreeScene() {
		return this._threeScene;
	}

	_updateNodes(modifiedEntities) {
		modifiedEntities.forEach(entity => this._updateNode(entity));
	}

	_buildScene(changes) {
		changes.forEach(change => {
			const { operation, entity, parent } = change;
			if (operation === 'added') {
				this._addToScene(entity, parent);
			}
		});
	}

	_updateNode(entity) {
		const position = this._ecs.getComponent(Position, entity);
		const rotation = this._ecs.getComponent(Rotation, entity);
		const scale = this._ecs.getComponent(Scale, entity);
		const node = this.threeNodes[entity];
		if (position) {
			node.position.x = position.x;
			node.position.y = position.y;
			node.position.z = position.z;
		}
		if (rotation) {
			node.rotation.x = rotation.x;
			node.rotation.y = rotation.y;
			node.rotation.z = rotation.z;
		}
		if (scale) {
			node.scale.x = scale.x;
			node.scale.y = scale.y;
			node.scale.z = scale.z;
		}
	}

	_addToScene(entity, parent) {
		const root = parent ? this.threeNodes[parent] : this._threeScene;
		const node = new THREE.Group();
		root.add(node);
		this.threeNodes[entity] = node;
	}
}

class CameraManager extends System {

	constructor(space) {
		super();
		this._threeCamera = null;
		this._space = space;
	}

	init() {
		this._ecs.observeEntities(
			this._entities.changing(PerspectiveCamera),
			this._updateCamera, this
		);
	}

	getThreeCamera() {
		return this._threeCamera;
	}

	_updateCamera(entities) {
		entities.forEach(entity => {
			const group = this._space.threeNodes[entity];
			const camera = this._ecs.getComponent(Camera, entity);
			this._threeCamera = new THREE.Camera(
				camera.fov, camera.aspect,
				camera.near, camera.far
			);
			group.add(this._threeCamera);
		});
	}

}

class ThreeRenderer extends System {

	constructor(threeRenderer, sceneHolder, cameraHolder) {
		super();
		this._renderer = threeRenderer;
		this._sceneHolder = sceneHolder;
		this._cameraHolder = cameraHolder;
	}

	init() {
		this._ecs.onTick(this._tick, this);
	}

	_tick() {
		const scene = this._sceneHolder.getThreeScene();
		const camera = this._cameraHolder.getThreeCamera();
		this._renderer.render(scene, camera);
	}

}

class Meshes extends System {

	constructor(space) {
		super();
		this._space = space;
	}

	init() {
		this._ecs.observeEntities(
			this._entities.changing(Mesh, Geometry, Material),
			this._buildGeometry, this
		);
	}

	_buildGeometry(entities) {
		entities.forEach(entity => {
			const group = this._space.threeNodes[entity];
			const geometry = this._ecs.getComponent(Geometry, entity);
			const material = this._ecs.getComponent(Material, entity);
			const threeMesh = new THREE.Mesh(
				this._threeGeometryFromComponent(geometry),
				this._threeMaterialFromComponent(material)
			);
			group.add(threeMesh);
		});
	}

}

class Animator extends System {

	constructor(space) {
		super();
		this._space = space;
	}

	init() {
		this._animated = this.entities.with(RotationSpeed, Rotation);
		this._ecs.onTick(this._animate, this);
	}

	_animate() {
		this._animated.forEach(entity => {
			this._ecs.updateComponent(Rotation, entity, rotation => {
				const speed = this._ecs.getComponent(RotationSpeed, entity);
				rotation.x += speed.x;
				rotation.y += speed.y;
				rotation.z += speed.z;
			});
		});
	}
}

class Camera extends Component {

}

class PerspectiveCamera extends Camera {

	constructor(fov, aspect, near, fav) {
		super();
		this.fov = fov;
		this.aspect = aspect;
		this.near = near;
		this.far = far;
	}

}

class Material extends Component {

}

class MeshNormalMaterial extends Material {

}

class Geometry extends Component {

}

class BoxGeometry extends Geometry {

	constructor(width, height, depth) {
		super();
		this.width = width;
		this.height = height;
		this.depth = depth;
	}

}

class Position extends Component {

	constructor(...args) {
		super();
		vec3ArgsToObject(this, ...args);
	}

}

class Rotation extends Component {

	constructor(...args) {
		super();
		vec3ArgsToObject(this, ...args);
	}

}

class Scale extends Component {

	constructor(...args) {
		super();
		vec3ArgsToObject(this, ...args);
	}

}

function vec3ArgsToObject(obj, x, y, z) {
	obj.x = x;
	obj.y = y;
	obj.z = z;
}