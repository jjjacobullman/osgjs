( function () {
    'use strict';

    //  get other js file Classes
    var ExampleOSGJS = window.ExampleOSGJS;

    var OSG = window.OSG;
    var osg = OSG.osg;
    var osgViewer = OSG.osgViewer;
    var osgShader = OSG.osgShader;
    var osgUtil = OSG.osgUtil;
    var Texture = osg.Texture;

    var $ = window.$;
    var P = window.P;

    var shaderProcessor = new osgShader.ShaderProcessor();

    // inherits for the ExampleOSGJS prototype
    var Example = function () {

        ExampleOSGJS.call( this );

        this._config = {
            ssao: true
        };

        this._depthTexture = null;
        this._depthCamera = null;

        this._shaders = {};
        this._viewport = new Array(2);

    };

    Example.prototype = osg.objectInherit( ExampleOSGJS.prototype, {

        createScene: function () {

            var group = new osg.Node();
            group.setName( 'group' );

            var ground = osg.createTexturedBoxGeometry( 0.0, 0.0, 0.0, 4.0, 4.0, 0.0 );
            ground.setName( 'groundBox' );

            var box = osg.createTexturedBoxGeometry( 0.0, 0.0, 0.0, 1.0, 1.0, 1.0 );
            box.setName( 'Box' );

            group.addChild( ground );
            group.addChild( box );

            return group;
        },

        createViewer: function () {
            this._canvas = document.getElementById( 'View' );
            this._viewer = new osgViewer.Viewer( this._canvas );
            this._viewer.init();

            this._viewer.setupManipulator();
            this._viewer.run();
        },

        readShaders: function () {

            var defer = P.defer();
            var self = this;

            var shaderNames = [
                'depthVertex.glsl',
                'depthFragment.glsl',
                'ssaoVertex.glsl',
                'ssaoFragment.glsl',
            ];

            var shaders = shaderNames.map( function ( arg ) {
                return 'shaders/' + arg;
            }.bind( this ) );

            var promises = [];
            shaders.forEach( function ( shader ) {
                promises.push( P.resolve( $.get( shader ) ) );
            } );

            P.all( promises ).then( function ( args ) {

                var shaderNameContent = {};
                shaderNames.forEach( function ( name, idx ) {
                    shaderNameContent[ name ] = args[ idx ];
                } );
                shaderProcessor.addShaders( shaderNameContent );

                var vertexshader = shaderProcessor.getShader( 'depthVertex.glsl' );
                var fragmentshader = shaderProcessor.getShader( 'depthFragment.glsl' );

                self._shaders.depth = new osg.Program(
                    new osg.Shader( 'VERTEX_SHADER', vertexshader ),
                    new osg.Shader( 'FRAGMENT_SHADER', fragmentshader ) );

                vertexshader = shaderProcessor.getShader( 'ssaoVertex.glsl' );
                fragmentshader = shaderProcessor.getShader( 'ssaoFragment.glsl' );

                self._shaders.ssao = new osg.Program(
                    new osg.Shader( 'VERTEX_SHADER', vertexshader ),
                    new osg.Shader( 'FRAGMENT_SHADER', fragmentshader ) );

                defer.resolve();

            } );

            return defer.promise;
        },

        createTextureRTT: function ( name, filter, type ) {

            var texture = new osg.Texture();
            texture.setInternalFormatType( type );
            texture.setTextureSize( this._canvas.width, this._canvas.height );

            texture.setInternalFormat( osg.Texture.RGBA );
            texture.setMinFilter( filter );
            texture.setMagFilter( filter );
            texture.setName( name );
            return texture;

        },

        createCameraRTT: function ( texture ) {

            var camera = new osg.Camera();
            camera.setName( 'MainCamera' );
            camera.setViewport( new osg.Viewport( 0, 0, this._canvas.width, this._canvas.height ) );

            camera.setRenderOrder( osg.Camera.PRE_RENDER, 0 );
            camera.attachTexture( osg.FrameBufferObject.COLOR_ATTACHMENT0, texture, 0 );

            camera.setReferenceFrame( osg.Transform.ABSOLUTE_RF );
            camera.attachRenderBuffer( osg.FrameBufferObject.DEPTH_ATTACHMENT, osg.FrameBufferObject.DEPTH_COMPONENT16 );

            camera.setClearColor( osg.vec4.fromValues( 0.0, 0.0, 0.1, 1.0 ) );
            return camera;

        },

        initDatGUI: function () {

            this._gui = new window.dat.GUI();
            var gui = this._gui;

            gui.add( this._config, 'ssao' );

        },

        run: function () {

            var self = this;

            this.initDatGUI();
            this.createViewer();

            var root = new osg.Node();
            var scene = this.createScene();

            this.readShaders().then( function () {

                self._depthTexture = self.createTextureRTT( 'depthRTT', Texture.LINEAR, osg.Texture.UNSIGNED_BYTE );
                self._depthCamera = self.createCameraRTT( self._depthTexture );
                self._depthCamera.getOrCreateStateSet().setAttributeAndModes( self._shaders.depth );

                var cam = self._depthCamera;
                //var quad = self.test();

                cam.addChild( scene );

                root.addChild( cam );
                root.addChild( scene );
                root.getOrCreateStateSet().setAttributeAndModes( self._shaders.ssao );
                root.getOrCreateStateSet().setTextureAttributeAndModes( 0, self._depthTexture );
                root.getOrCreateStateSet().addUniform( osg.Uniform.createInt( 0, 'uDepthTexture' ) );

                //root.addChild( quad );

                self._viewer.setSceneData( root );
                self._viewer.getCamera().setClearColor( [ 0.0, 0.0, 0.0, 0.0 ] );

                var UpdateCallback = function() {
                    this.update = function () {

                        var rootCam = self._viewer.getCamera();
                        osg.mat4.copy( cam.getViewMatrix(), rootCam.getViewMatrix() );
                        osg.mat4.copy( cam.getProjectionMatrix(), rootCam.getProjectionMatrix() );

                        self._viewport[0] = cam.getViewport().width();
                        self._viewport[1] = cam.getViewport().height();

                        root.getOrCreateStateSet().addUniform( osg.Uniform.createFloat2( self._viewport, 'uViewport' ) );

                        return true;
                    };
                };

                cam.addUpdateCallback(new UpdateCallback());
            } );

        },

        test: function () {
            // final Quad
            var quadSize = [ 16 * 16 / 9, 16 * 1 ];
            var quad = osg.createTexturedQuadGeometry( -quadSize[ 0 ] / 2.0, 0, -quadSize[ 1 ] / 2.0,
                quadSize[ 0 ], 0, 0,
                0, 0, quadSize[ 1 ] );


            quad.getOrCreateStateSet().setTextureAttributeAndModes( 0, this._depthTexture );
            quad.getOrCreateStateSet().setAttributeAndModes( this._shaders.ssao );
            quad.getOrCreateStateSet().setAttributeAndModes( new osg.CullFace( 'DISABLE' ) );
            quad.getOrCreateStateSet().addUniform( osg.Uniform.createInt( 0, 'uDepthTexture' ) );

            return quad;
        }

    } );


    window.addEventListener( 'load', function () {
        var example = new Example();
        example.run();
    }, true );

} )();
