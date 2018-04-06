var ECS = THREE.ECS = {};

var Finder = ECS.Finder = function ( entities, systems ) {

};

Finder.prototype = {
	constructor: Finder,

	withChanging: function () {
		return {
			forEach: function () {  }
		};
	}
};

ECS.getDefaultFinder = function ( entities, systems ) {
	return new Finder(entities, systems);
};

var Ecs = ECS.Ecs = function () {
	this._entities = [];
	this._systems = [];
	this._finder = THREE.ECS.getDefaultFinder( this._entities, this._systems );
};

Ecs.prototype = {
	constructor: Scene,

	add: function ( entity, parent=null ) {
		if ( parent ) { parent.add( entity ); }
		this._entities.push(entity);
		this._systems.forEach( function ( system ) {
			system.onHierarchyUpdate && system.onHierarchyUpdate( 'added', this, entity );
		} );
	},

	addSystem: function (system) {
		this._systems.push(system);
		system.entities = this._finder;
		system.scene = this;
		system.init();
	},

	tick: function (timestamp) {
		this._systems.forEach( function ( system ) {
			system.onTick && system.onTick( timestamp );
		} );
	}
};

var Entity = ECS.Entity = function () {
	this._components = [];
};

Entity.prototype = {
	constructor: Entity,

	addComponent: function ( component ) {
		this._components.push( component );
	}
};

ECS.components = {};
ECS.systems = {};

var Position = ECS.components.Position = function ( x, y, z ) {
	this.x = x;
	this.y = y;
	this.z = z;
};

var Rotation = ECS.components.Rotation = function ( x, y, z ) {
	this.x = x;
	this.y = y;
	this.z = z;
	this.order = 'XYZ';
};

var Scale = ECS.components.Scale = function ( x, y, z ) {
	this.x = x;
	this.y = y;
	this.z = z;
};

var Mesh = ECS.components.Mesh = function () {

};

var BoxGeometry = ECS.components.BoxGeometry = function ( width, height, depth ) {
	this.width = width;
	this.height = height;
	this.depth = depth;
};

var MeshNormalMaterial = ECS.components.MeshNormalMaterial = function () {

};

var PerspectiveCamera = ECS.components.PerspectiveCamera = function ( fov, aspect, near, far ) {
	this.fov = fov;
	this.aspect = aspect;
	this.near = near;
	this.far = far;
};

var CartesianSpace = ECS.systems.CartesianSpace = function ( ) {
	this._root = new THREE.Scene();
	this._entityToObject3DMap = new Map();
};

CartesianSpace.prototype = {

	init: function () {
		this._entityToObject3DMap[ this.scene ] = this._root;
		this._changedSpatialEntities = this.entities.withChanging([Position, Rotation, Scale]);
	},

	onHierarchyUpdate: function ( operation, parent, entity ) {
		if ( operation === 'added' ) {
			this._addToSceneGraph( parent, entity );
		}
	},

	onChanges: function () {
		this._changedSpatialEntities.forEach( function ( entity ) {
			var object3d = this._findObjectForEntity( entity );
			this._updateTransform( object3d, entity );
		}, this );
	},

	getThreeScene: function () {
		return this._root;
	},

	_addToSceneGraph: function ( parent, entity ) {
		var parentObject = this._findObjectForEntity( parent );
		var object3d = new THREE.Object3D();

		parentObject.add( object3d );
		this._entityToObject3DMap.add( entity, object3d );

		entity.children.forEach( function ( child ) {
			this._addToSceneGraph( entity, child );
		}, this );
	},

	_findObjectForEntity: function ( entity ) {
		return this._entityToObject3DMap.get( entity );
	},

	_updateTransform: function ( object3d, entity ) {
		var position = entity.getComponent( Position );
		var rotation = entity.getComponent( Rotation );
		var scale = entity.getComponent( Scale );
		object3d.position.x = position.x;
		object3d.position.y = position.y;
		object3d.position.z = position.z;
		object3d.rotation.x = rotation.x;
		object3d.rotation.y = rotation.y;
		object3d.rotation.z = rotation.z;
		object3d.rotation.order = rotation.order;
		object3d.scale.x = scale.x;
		object3d.scale.y = scale.y;
		object3d.scale.z = scale.z;
	}

};

var CameraManager = ECS.systems.CameraManager = function ( threeSceneManager ) {
	this._renderer = renderer;
	this._threeSceneManager = threeSceneManager;
};

CameraManager.prototype = {
	constructor: CameraManager,

	init: function () {
		this._changedCameraEntities = this.entities.withChanging(Camera);
	},

	onChanges: function () {
		this._changedCameraEntities.forEach( function ( entity ) {
			var threeCamera = this._findObjectForEntity( entity );
			if ( entity.getComponent(Camera).isActive ) {
				this._threeActiveCamera = threeCamera;
			}
		}, this );
	},

	getThreeCamera: function () {
		return this._threeActiveCamera;
	}
};

var ThreeRenderer = ECS.systems.ThreeRenderer = function ( renderer, threeSceneManager, threeCameraManager ) {
	this._renderer = renderer;
	this._threeSceneManager = threeSceneManager;
	this._threeCameraManager = threeCameraManager;
};

ThreeRenderer.prototype = {
	constructor: ThreeRenderer,

	onTick: function ( timestamp ) {
		var scene = this._threeSceneManager.getThreeScene();
		var camera = this._threeCameraManager.getThreeCamera();
		renderer.render( scene, camera );
	}
};