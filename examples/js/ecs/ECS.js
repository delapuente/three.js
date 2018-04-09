
class Ecs {

	constructor() {
		this._systems = [];
		this._observers = [];
		this._filters = [];
		this._entities = [];
		this._hierarchyObservers = {};
		this._hierarchyUpdates = {};
		this._tickCallbacks = [];
		this._components = new Map();
		this._clasifiedEntities = new Set();
		this._hierarchies = {};
		this._classificationPending = [];
	}

	registerSystem(system) {
		system.setEcs(this);
		system.init();
		this._systems.push(system);
	}

	addComponent(entity, component) {
		if (this._entities.indexOf(entity) >= 0) {
			this._clasifyEntity(entity, {
				added: [component]
			});
			this._components.get(entity).push(component);
		}
		else {
			const components = this._components.get(entity) || [];
			components.push(component);
			this._components.set(entity, components);
		}

	}

	getComponent(componentClass, entity) {
		const components = this._components.get(entity);
		for (let i = 0, l = components.length; i < l; i++) {
			let component = components[i];
			if (component instanceof componentClass) {
				return component;
			}
		}
		return null;
	}

	add(entity, parent=null, relation='default') {
		this._hierarchies[relation] = this._hierarchies[relation] || new Map();
		this._hierarchies[relation][parent] = this._hierarchies[relation][parent] || [];
		this._hierarchies[relation][parent].push(entity);
		entity.setParent(parent, relation);
		this._hierarchyUpdates[relation] = this._hierarchyUpdates[relation] || [];
		this._hierarchyUpdates[relation].push(['added', entity, parent]);
		// it remains to compact
		if (this._entities.indexOf(entity) < 0) {
			this._clasifyEntity(entity, {
				added: this._components.get(entity)
			});
			this._entities.push(entity);
		}
	}

	tick() {
		this._notifyHierarchyUpdates();
		this._notifyObservers();
		this._notifyTick();
		this._cleanUpObservers();
		this._cleanUpHierarchyUpdates();
		this._reclasify();
	}

	filterEntities(filter) {
		const list = [];
		this._filters.push({ filter, list });
		return list;
	}

	updateComponent(componentClass, entity, updateCallback) {
		const component = this.getComponent(componentClass, entity);
		updateCallback(component);
		if (this._entities.indexOf(entity) >= 0) {
			this._classificationPending.push([entity, { updated: [component] }]);
		}
	}

	observeEntities(filter, callback, context) {
		this._updateObservers(filter, callback, context);
	}

	observeHierarchy(name, callback, context) {
		this._updateHierarchyObservers(name, callback, context);
	}

	onTick(callback, context) {
		this._tickCallbacks.push([callback, context]);
	}

	getDefaultChannel() {
		return new SameThreadChannel();
	}

	_updateObservers(filter, callback, context) {
		const filterIndex = this._findFilterInObservers(filter);
		if (filterIndex >= 0) {
			this._observers[filterIndex].callbacks.push([callback, context]);
		}
		else {
			this._observers.push({ filter, list: [], callbacks: [[callback, context]] });
		}
	}

	_updateHierarchyObservers(name, callback, context) {
		const hierarchyObservers = this._hierarchyObservers;
		if (!(name in hierarchyObservers)) {
			hierarchyObservers[name] = [[callback, context]];
		}
		else {
			hierarchyObservers[name].push([callback, context]);
		}
	}

	_reclasify() {
		this._classificationPending.forEach(([entity, changes]) => {
			this._clasifyEntity(entity, changes);
		});
	}

	_clasifyEntity(entity, changed={}) {
		this._observers.forEach(({filter, list}) => {
			if (filter.test(this._components.get(entity), changed)) {
				list.push(entity);
			}
		});
		if (!this._clasifiedEntities.has(entity)) {
			this._filters.forEach(({filter, list}) => {
				if (filter.test(this._components.get(entity), changed)) {
					list.push(entity);
				}
			});
			this._clasifiedEntities.add(entity);
		}
	}

	_notifyHierarchyUpdates() {
		Object.keys(this._hierarchyUpdates).forEach(relation => {
			const updates = this._hierarchyUpdates[relation];
			const targets = this._hierarchyObservers[relation];
			targets.forEach(([callback, context]) => {
				callback.call(context, updates);
			});
		});
	}

	_notifyObservers() {
		this._observers.forEach(({list, callbacks}) => {
			callbacks.forEach(([callback, context]) => {
				callback.call(context, list);
			})
		});
	}

	_notifyTick() {
		this._tickCallbacks.forEach(([callback, context]) => {
			callback.call(context);
		});
	}

	_cleanUpHierarchyUpdates() {
		this._hierarchyUpdates = [];
	}

	_cleanUpObservers() {
		this._observers.forEach(observation => {
			observation.list = [];
		});
	}

	_findFilterInObservers(filter) {
		const observers = this._observers;
		for (let i = 0, l = observers.length; i < l; i++) {
			if (observers[i].filter.equals(filter)) {
				return i;
			}
		}
		return -1;
	}
}

class Entity {

	constructor() {
		this._parents = {};
	}

	setParent(parent, relation='default') {
		this._parents[relation] = parent;
	}

}

class Component {

}

class System {

	constructor() {
		this._ecs = null;
	}

	setEcs(ecs) {
		this._ecs = ecs;
	}

}

class Hierarchy {

}

class ComponentFilter {

	constructor() {
		this._mustHave = [];
		this._canChange = [];
	}

	equals(anotherFilter) {
		return this._deepEqual(this._canChange, anotherFilter._canChange) &&
			this._deepEqual(this._mustHave, anotherFilter._mustHave);
	}

	changing(...components) {
		this._canChange.push(...components);
		return this;
	}

	have(...components) {
		this._mustHave.push(...components);
		return this;
	}

	test(components, {added=[], removed=[], updated=[]}={}) {
		for (let i = 0, l = this._mustHave.length; i < l; i++) {
			let target = this._mustHave[i];
			let hasComponent = false;
			for (let j = 0, cl = components.length; j < cl; j++) {
				let component = components[j];
				if (component instanceof target) {
					hasComponent = true;
					break;
				}
			}
			if (!hasComponent) {
				return false;
			}
		}
		if (this._canChange.length > 0) {
			for (let i = 0, l = added.length; i < l; i++) {
				if (this._in(added[i], this._canChange)) {
					return true;
				}
			}
			for (let i = 0, l = removed.length; i < l; i++) {
				if (this._in(removed[i], this._canChange)) {
					return true;
				}
			}
			for (let i = 0, l = updated.length; i < l; i++) {
				if (this._in(updated[i], this._canChange)) {
					return true;
				}
			}
			return false;
		}
		return true;
	}

	_deepEqual(list, anotherList) {
		if (list.length !== anotherList.length) {
			return false;
		}
		for (let i = 0, l = list.length; i < l; i++) {
			let item = list[i];
			if (anotherList.indexOf(item) < 0) {
				return false;
			}
		}
		return true;
	}

	_in(component, collection) {
		for (let i = 0, l = collection.length; i < l; i++) {
			let componentClass = collection[i];
			if (component instanceof componentClass) {
				return true;
			}
		}
		return false;
	}
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
			(new ComponentFilter()).changing(Position, Rotation, Scale),
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
			const [ operation, entity, parent ] = change;
			if (operation === 'added') {
				this._addToScene(entity, parent);
			}
		});
	}

	_updateNode(entity) {
		const position = this._ecs.getComponent(Position, entity);
		const rotation = this._ecs.getComponent(Rotation, entity);
		const scale = this._ecs.getComponent(Scale, entity);
		const node = this.threeNodes.get(entity);
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
		const root = parent ? this.threeNodes.get(parent) : this._threeScene;
		const node = new THREE.Group();
		root.add(node);
		this.threeNodes.set(entity, node);
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
			(new ComponentFilter()).changing(PerspectiveCamera),
			this._updateCamera, this
		);
	}

	getThreeCamera() {
		return this._threeCamera;
	}

	_updateCamera(entities) {
		entities.forEach(entity => {
			const group = this._space.threeNodes.get(entity);
			const camera = this._ecs.getComponent(Camera, entity);
			this._threeCamera = new THREE.PerspectiveCamera(
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
			(new ComponentFilter()).changing(Mesh, Geometry, Material),
			this._buildGeometry, this
		);
	}

	_buildGeometry(entities) {
		entities.forEach(entity => {
			const group = this._space.threeNodes.get(entity);
			const geometry = this._ecs.getComponent(Geometry, entity);
			const material = this._ecs.getComponent(Material, entity);
			const threeMesh = new THREE.Mesh(
				this._threeGeometryFromComponent(geometry),
				this._threeMaterialFromComponent(material)
			);
			group.add(threeMesh);
		});
	}

	_threeGeometryFromComponent(geometry) {
		if (geometry instanceof BoxGeometry) {
			return new THREE.BoxGeometry(
				geometry.width,
				geometry.height,
				geometry.depth
			);
		}
		throw "Geometry not supported";
	}

	_threeMaterialFromComponent(material) {
		if (material instanceof MeshNormalMaterial) {
			return new THREE.MeshNormalMaterial();
		}
		throw "Material not supported";
	}

}

class Animator extends System {

	constructor(space) {
		super();
		this._space = space;
	}

	init() {
		this._animated = this._ecs.filterEntities(
			(new ComponentFilter()).have(RotationSpeed, Rotation)
		);
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

class RotationSpeed extends Component {

	constructor(x=0, y=0, z=0) {
		super();
		vec3ArgsToObject(this, x, y, z);
	}

}

class Camera extends Component {

}

class PerspectiveCamera extends Camera {

	constructor(fov, aspect, near, far) {
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

	constructor(x=0, y=0, z=0) {
		super();
		vec3ArgsToObject(this, x, y, z);
	}

}

class Rotation extends Component {

	constructor(x=0, y=0, z=0) {
		super();
		vec3ArgsToObject(this, x, y, z);
	}

}

class Scale extends Component {

	constructor(x=1, y=1, z=1) {
		super();
		vec3ArgsToObject(this, x, y, z);
	}

}

class Mesh extends Component {

}

function vec3ArgsToObject(obj, x, y, z) {
	obj.x = x;
	obj.y = y;
	obj.z = z;
}