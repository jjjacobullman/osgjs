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

    var convertColor = function ( color ) {
        var r, g, b;

        // rgb [255, 255, 255]
        if ( color.length === 3 ) {
            r = color[ 0 ];
            g = color[ 1 ];
            b = color[ 2 ];

        } else if ( color.length === 7 ) {

            // hex (24 bits style) '#ffaabb'
            var intVal = parseInt( color.slice( 1 ), 16 );
            r = intVal >> 16;
            g = intVal >> 8 & 0xff;
            b = intVal & 0xff;
        }

        var result = [ 0, 0, 0, 1 ];
        result[ 0 ] = r / 255.0;
        result[ 1 ] = g / 255.0;
        result[ 2 ] = b / 255.0;
        return result;
    };

    // inherits for the ExampleOSGJS prototype
    var Example = function () {

        ExampleOSGJS.call( this );

        this._config = {
            ssao: true,
            blur: true,
            radius: 1.0,
            bias: 0.01,
            intensity: 0.8,
            sceneColor: '#ECF0F1',
            scene: 'box'
        };

        this._modelList = [];
        this._modelList.push( this._config.scene );

        this._modelsMap = {};

        this._uniforms = {
            ssao: osg.Uniform.createFloat1( 1.0, 'uAoFactor' ),
            radius: osg.Uniform.createFloat1( 1.0, 'uRadius' ),
            bias: osg.Uniform.createFloat1( 0.01, 'uBias' ),
            intensity: osg.Uniform.createFloat1( 0.8, 'uIntensityDivRadius6' ),
            near: osg.Uniform.createFloat1( 1.0, 'uNear' ),
            far: osg.Uniform.createFloat1( 1000.0, 'uFar' ),
            viewport: osg.Uniform.createFloat2( new Array( 2 ), 'uViewport' ),
            projectionInfo: osg.Uniform.createFloat4( new Array( 4 ), 'uProjectionInfo' ),
            projectionScale: osg.Uniform.createFloat1( 500.0, 'uProjScale' ),
            sceneColor: osg.Uniform.createFloat4( new Array( 4 ), 'uSceneColor' ),
            uDepthTexture: null
        };

        this._blurUniforms = {

            uViewport: this._uniforms.viewport,
            uAoTexture: null,
            uAxis: osg.Uniform.createFloat2( new Array( 2 ), 'uAxis' )

        };

        this._blurVerticalUniforms = {

            uViewport: this._uniforms.viewport,
            uAoTexture: null,
            uAxis: osg.Uniform.createFloat2( new Array( 2 ), 'uAxis' )

        };

        this._rootScene = new osg.Node();
        this._rttCamera = null;

        this._projectionInfo = new Array( 4 );

        this._depthTexture = null;
        this._currentAoTexture = null;
        this._aoTexture = null;
        this._aoBluredTexture = null;

        this._composer = new osgUtil.Composer();
        this._renderTextures = new Array( 4 );

        this._shaders = {};
    };

    Example.prototype = osg.objectInherit( ExampleOSGJS.prototype, {

        createScene: function () {

            var group = new osg.Node();
            group.setName( 'group' );

            var ground = osg.createTexturedBoxGeometry( 0.0, 0.0, 0.0, 4.0, 4.0, 0.0 );
            ground.setName( 'groundBox' );

            var box = osg.createTexturedBoxGeometry( 0.0, 0.0, 0.0, 1.0, 1.0, 1.0 );
            box.setName( 'Box' );

            var boxSmall = osg.createTexturedBoxGeometry( 0.0, 0.0, 0.0, 0.5, 0.5, 0.5 );

            var mat = new osg.MatrixTransform();
            osg.mat4.translate( mat.getMatrix(), mat.getMatrix(), [ 0, 0, 0.5 ] );

            mat.addChild( boxSmall );
            group.addChild( ground );
            group.addChild( box );
            group.addChild( mat );

            this._modelsMap.box = group;

            return group;
        },

        createViewer: function () {
            this._canvas = document.getElementById( 'View' );
            this._viewer = new osgViewer.Viewer( this._canvas );
            this._viewer.init();

            this._viewer.setupManipulator();
            this._viewer.run();

            this._viewer.getCamera().setComputeNearFar( false );
        },

        readShaders: function () {

            var defer = P.defer();
            var self = this;

            var shaderNames = [
                'depthVertex.glsl',
                'depthFragment.glsl',
                'standardVertex.glsl',
                'standardFragment.glsl',
                'ssaoFragment.glsl',
                'blurFragment.glsl'
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
                    new osg.Shader( 'FRAGMENT_SHADER', fragmentshader )
                );

                vertexshader = shaderProcessor.getShader( 'standardVertex.glsl' );
                fragmentshader = shaderProcessor.getShader( 'standardFragment.glsl' );

                self._shaders.standard = new osg.Program(
                    new osg.Shader( 'VERTEX_SHADER', vertexshader ),
                    new osg.Shader( 'FRAGMENT_SHADER', fragmentshader ) );

                defer.resolve();

            } );

            return defer.promise;
        },

        createComposer: function ( rttDepth ) {
            var composer = this._composer;

            //var vertex = shaderProcessor.getShader( 'standardVertex.glsl' );
            var aoFragment = shaderProcessor.getShader( 'ssaoFragment.glsl' );
            var blurFragment = shaderProcessor.getShader( 'blurFragment.glsl' );

            // The composer makes 3 passes
            // 1. noisy AO to texture
            // 2. horizontal blur on the AO texture
            // 3. vertical blur on the previously blured texture

            // Creates AO textures for each pass
            var rttAo = this.createTextureRTT( 'rttAoTexture', Texture.NEAREST, Texture.FLOAT );
            var rttAoHorizontalFilter = this.createTextureRTT( 'rttAoTextureHorizontal', Texture.NEAREST, Texture.FLOAT );
            var rttAoVerticalFilter = this.createTextureRTT( 'rttAoTextureVertical', Texture.NEAREST, Texture.FLOAT );

            this._renderTextures[ 0 ] = rttDepth;
            this._renderTextures[ 1 ] = rttAo;
            this._renderTextures[ 2 ] = rttAoHorizontalFilter;
            this._renderTextures[ 3 ] = rttAoVerticalFilter;

            this._uniforms.uDepthTexture = this._depthTexture;
            var aoPass = new osgUtil.Composer.Filter.Custom( aoFragment, this._uniforms );
            //aoPass.setVertexShader( vertex );

            this._blurUniforms.uAoTexture = rttAo;
            this._blurUniforms.uAxis = [ 1.0, 0.0 ];
            var blurHorizontalPass = new osgUtil.Composer.Filter.Custom( blurFragment, this._blurUniforms );
            //blurHorizontalPass.setVertexShader( vertex );

            this._blurVerticalUniforms.uAoTexture = rttAoHorizontalFilter;
            this._blurVerticalUniforms.uAxis = [ 0.0, 1.0 ];
            var blurVerticalPass = new osgUtil.Composer.Filter.Custom( blurFragment, this._blurVerticalUniforms );
            //blurVerticalPass.setVertexShader( vertex );

            this._aoTexture = rttAo;
            this._aoBluredTexture = rttAoVerticalFilter;
            this._currentAoTexture = this._aoBluredTexture;

            composer.addPass( aoPass, rttAo );
            composer.addPass( blurHorizontalPass, rttAoHorizontalFilter );
            composer.addPass( blurVerticalPass, rttAoVerticalFilter );

            //composer.renderToScreen( this._canvas.width, this._canvas.height );
            composer.build();
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

        createCameraRTT: function ( texture, depth ) {

            var camera = new osg.Camera();
            camera.setName( 'MainCamera' );
            camera.setViewport( new osg.Viewport( 0, 0, this._canvas.width, this._canvas.height ) );

            camera.setRenderOrder( osg.Camera.PRE_RENDER, 0 );
            camera.attachTexture( osg.FrameBufferObject.COLOR_ATTACHMENT0, texture, 0 );

            camera.setReferenceFrame( osg.Transform.ABSOLUTE_RF );

            if ( depth ) {

                camera.attachRenderBuffer( osg.FrameBufferObject.DEPTH_ATTACHMENT, osg.FrameBufferObject.DEPTH_COMPONENT16 );
                camera.setClearColor( osg.vec4.fromValues( 0.0, 0.0, 0.0, 0.0 ) );

            } else {

                camera.setClearMask( 0 );

            }


            return camera;

        },

        createDepthCameraRTT: function () {

            var rttDepth = this.createTextureRTT( 'rttDepth', Texture.NEAREST, osg.Texture.FLOAT );
            this._depthTexture = rttDepth;

            var cam = this.createCameraRTT( rttDepth, true );
            cam.setComputeNearFar( false );

            // Set uniform to render depth
            var stateSetCam = cam.getOrCreateStateSet();
            stateSetCam.setAttributeAndModes( this._shaders.depth );
            //stateSetCam.addUniform( this._uniforms.c );
            stateSetCam.addUniform( this._uniforms.viewport );

            return cam;
        },

        updateUniforms: function ( stateSet ) {

            var keys = window.Object.keys( this._uniforms );

            for ( var i = 0; i < keys.length; ++i ) {

                stateSet.addUniform( this._uniforms[ keys[ i ] ] );

            }

        },

        updateSSAOOnOff: function () {
            var uniform = this._uniforms.ssao;
            var value = this._config.ssao ? 1.0 : 0.0;
            uniform.setFloat( value );
        },

        updateBlur: function () {
            if ( this._config.blur ) this._currentAoTexture = this._aoBluredTexture;
            else this._currentAoTexture = this._aoTexture;
        },

        updateBias: function () {
            var uniform = this._uniforms.bias;
            var value = this._config.bias;
            uniform.setFloat( value );
        },

        updateRadius: function () {
            var uniform = this._uniforms.radius;
            var value = this._config.radius;
            uniform.setFloat( value );

            // The intensity is dependent
            // from the radius
            this.updateIntensity();
        },

        updateIntensity: function () {
            var uniform = this._uniforms.intensity;
            var intensity = this._config.intensity;
            var value = intensity / Math.pow( this._config.radius, 6 );
            uniform.setFloat( value );
        },

        updateSceneColor: function () {
            var color = convertColor( this._config.sceneColor );
            var uniform = this._uniforms.sceneColor;

            uniform.setFloat4( color );
        },

        updateScene: function () {

            var sceneId = this._config.scene;
            var node = this._modelsMap[ sceneId ];

            // Cleans root & camera
            this._rootScene.removeChildren();
            this._rttCamera.removeChildren();
            // Adds the new scene
            this._rootScene.addChild( node );
            this._rttCamera.addChild( node );

        },

        addScene: function ( name, scene ) {

            this._modelList.push( name );
            this._modelsMap[ name ] = scene;
            this._config.scene = name;

            var controllers = this._gui.__controllers;
            controllers[ controllers.length - 1 ].remove();
            this._gui.add( this._config, 'scene', this._modelList )
                .onChange( this.updateScene.bind( this ) );

            this.updateScene();

        },

        initDatGUI: function () {

            this._gui = new window.dat.GUI();
            var gui = this._gui;

            gui.add( this._config, 'ssao' )
                .onChange( this.updateSSAOOnOff.bind( this ) );
            gui.add( this._config, 'blur' )
                .onChange( this.updateBlur.bind( this ) );
            gui.add( this._config, 'radius', 0.01, 10.0 )
                .onChange( this.updateRadius.bind( this ) );
            gui.add( this._config, 'bias', 0.01, 0.8 )
                .onChange( this.updateBias.bind( this ) );
            gui.add( this._config, 'intensity', 0.01, 5.0 )
                .onChange( this.updateIntensity.bind( this ) );
            gui.addColor( this._config, 'sceneColor' )
                .onChange( this.updateSceneColor.bind( this ) );
            gui.add( this._config, 'scene', this._modelList )
                .onChange( this.updateScene.bind( this ) );

            this.updateIntensity();
            this.updateSceneColor();

        },

        run: function () {

            var self = this;

            this.initDatGUI();
            this.createViewer();

            this.readShaders().then( function () {

                var scene = self.createScene();

                self._rttCamera = self.createDepthCameraRTT();
                self._rttCamera.addChild( scene );

                self.createComposer( self._depthTexture );
                var composerNode = new osg.Node();
                composerNode.addChild( self._composer );

                var stateSetRoot = self._rootScene.getOrCreateStateSet();
                stateSetRoot.setAttributeAndModes( self._shaders.standard );
                self.updateUniforms( stateSetRoot );

                self._rootScene.addChild( scene );

                var root = new osg.Node();
                root.addChild( self._rttCamera );
                root.addChild( composerNode );
                root.addChild( self._rootScene );

                self._viewer.getCamera().setClearColor( [ 0.0, 0.0, 0.0, 0.0 ] );
                self._viewer.setSceneData( root );

                var UpdateCallback = function () {
                    this.update = function () {

                        var rootCam = self._viewer.getCamera();
                        var projection = rootCam.getProjectionMatrix();

                        osg.mat4.copy( self._rttCamera.getViewMatrix(), rootCam.getViewMatrix() );
                        osg.mat4.copy( self._rttCamera.getProjectionMatrix(), projection );

                        var frustum = {};
                        osg.mat4.getFrustum( frustum, self._rttCamera.getProjectionMatrix() );

                        var width = self._canvas.width;
                        var height = self._canvas.height;

                        var zFar = frustum.zFar;
                        var zNear = frustum.zNear;

                        // Updates SSAO uniforms
                        //self._uniforms.c.setFloat3( [ zNear * zFar, zNear - zFar, zFar ] );
                        self._uniforms.near.setFloat( zNear );
                        self._uniforms.far.setFloat( zFar );
                        self._uniforms.viewport.setFloat2( [ width, height ] );

                        self._projectionInfo[ 0 ] = -2.0 / ( width * projection[ 0 ] ); //projection[0][0]
                        self._projectionInfo[ 1 ] = -2.0 / ( height * projection[ 5 ] );
                        self._projectionInfo[ 2 ] = ( 1.0 - projection[ 8 ] ) / projection[ 0 ];
                        self._projectionInfo[ 3 ] = ( 1.0 + projection[ 10 ] ) / projection[ 5 ];

                        /*self._projectionInfo[ 0 ] = -2.0 / ( width * projection[ 0 ] ); //projection[0][0]
                        self._projectionInfo[ 1 ] = -2.0 / ( height * projection[ 5 ] );
                        self._projectionInfo[ 2 ] = ( 1.0 - projection[ 2 ] ) / projection[ 0 ];
                        self._projectionInfo[ 3 ] = ( 1.0 + projection[ 6 ] ) / projection[ 5 ];*/

                        self._uniforms.projectionInfo.setFloat4( self._projectionInfo );
                        //self._uniforms.projectionScale.setFloat(1.0 / (2.0 * Math.tan(45.0 * 0.5)));
                        self._uniforms.projectionScale.setFloat((2.0 * Math.tan(45.0 * 0.5)) * 450.0);

                        stateSetRoot.setTextureAttributeAndModes( 0, self._currentAoTexture );

                        return true;
                    };
                };

                self._rttCamera.addUpdateCallback( new UpdateCallback() );
            } );

        },

    } );

    var dragOverEvent = function ( evt ) {

        evt.stopPropagation();
        evt.preventDefault();
        evt.dataTransfer.dropEffect = 'copy';

    };

    var dropEvent = function ( evt ) {

        var self = this;

        evt.stopPropagation();
        evt.preventDefault();

        var files = evt.dataTransfer.files;
        var sceneName = null;

        for ( var i = 0; i < files.length; ++i ) {

            if ( files[ i ].name.indexOf( '.gltf' ) !== -1 ) {

                sceneName = files[ i ].name;
                break;

            }

        }

        var promise = OSG.osgDB.Registry.instance().getReaderWriterForExtension( 'gltf' )
            .readNodeURL( files );

        promise.then( function ( scene ) {

            if ( !scene ) return;

            var mt = new osg.MatrixTransform();
            osg.mat4.fromRotation( mt.getMatrix(), Math.PI / 2, [ 1, 0, 0 ] );

            mt.addChild(scene);

            self.addScene( sceneName, mt );
        } );

    };

    window.addEventListener( 'load', function () {
        var example = new Example();
        example.run();

        // Adds drag'n'drop feature
        window.addEventListener( 'dragover', dragOverEvent.bind( example ), false );
        window.addEventListener( 'drop', dropEvent.bind( example ), false );

    }, true );

} )();
