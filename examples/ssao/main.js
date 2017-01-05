( function () {
    'use strict';

    var ExampleOSGJS = window.ExampleOSGJS;

    var OSG = window.OSG;
    var osg = OSG.osg;
    var osgViewer = OSG.osgViewer;
    var osgShader = OSG.osgShader;
    var osgUtil = OSG.osgUtil;
    var Texture = osg.Texture;

    var $ = window.$;
    var P = window.P;

    var resolution = 1.0;

    var shaderProcessor = new osgShader.ShaderProcessor();

    // inherits for the ExampleOSGJS prototype
    var Example = function () {

        ExampleOSGJS.call( this );

        this._config = {
            ssao: true,
            fallOfMethod: '0',
            blur: true,
            scale: 1.0,
            radius: 1.0,
            bias: 0.01,
            intensity: 0.8,
            crispness: 1.0,
            sceneColor: '#ECF0F1', // '#d71515',
            scene: 'box'
        };

        // The two following attributes are use for sliders
        // normalization according to the scene bounding sphere
        this._baseSlidersBounds = {
            radius: [ 0.05, 2.0 ],
            bias: [ 0.01, 0.8 ],
            intensity: [ 0.01, 5.0 ],
        };
        this._baseSceneRadius = 2.8284271247461903;

        // Contains 4 fall-of method, from 0 to 3
        // resulting in a smoother or more constrated AO
        this._fallOfMethods = [ '0', '1', '2', '3' ];

        this._modelsMap = {};
        this._modelList = [];
        this._modelList.push( this._config.scene );

        this._globalUniforms = {
            uBoundingSphereRadius: osg.Uniform.createFloat1( 1.0, 'uBoudingSphereRadius' ),
        };

        this._mipmapUniforms = {
            uDepthTexture: null,
            uViewport: osg.Uniform.createFloat2( new Array( 2 ), 'uViewport' ),
        };

        this._aoUniforms = {
            uRadius: osg.Uniform.createFloat1( this._config.radius, 'uRadius' ),
            uRadius2: osg.Uniform.createFloat1( this._config.radius * this._config.radius, 'uRadius2' ),
            uBias: osg.Uniform.createFloat1( this._config.bias, 'uBias' ),
            uIntensityDivRadius6: osg.Uniform.createFloat1( this._config.intensity, 'uIntensityDivRadius6' ),
            uNear: osg.Uniform.createFloat1( 1.0, 'uNear' ),
            uFar: osg.Uniform.createFloat1( 1000.0, 'uFar' ),
            uProjectionInfo: osg.Uniform.createFloat4( new Array( 4 ), 'uProjectionInfo' ),
            uProjScale: osg.Uniform.createFloat1( 1.0, 'uProjScale' ),
            uFallOfMethod: osg.Uniform.createInt1( 0, 'uFallOfMethod' ),
            uDepthTexture: null,
        };

        this._blurUniforms = {
            uAoTexture: null,
            uAxis: osg.Uniform.createInt2( new Array( 2 ), 'uAxis' ),
            uInvRadius: osg.Uniform.createFloat( 1.0, 'uInvRadius' ),
            uCrispness: osg.Uniform.createFloat( this._config.crispness, 'uCrispness' ),
        };

        this._blurVerticalUniforms = {
            uAoTexture: null,
            uAxis: osg.Uniform.createInt2( new Array( 2 ), 'uAxis' ),
            uInvRadius: this._blurUniforms.uInvRadius,
            uCrispness: this._blurUniforms.uCrispness,
        };

        this._uniforms = {
            radius: osg.Uniform.createFloat1( 1.0, 'uRadius' ),
            bias: osg.Uniform.createFloat1( 0.01, 'uBias' ),
            intensity: osg.Uniform.createFloat1( 1.0, 'uIntensityDivRadius6' ),
            c: osg.Uniform.createFloat3( new Array( 3 ), 'uC' ),
            projectionInfo: osg.Uniform.createFloat4( new Array( 4 ), 'uProjectionInfo' )
        };

        this._projectionInfo = new Array( 4 );

        // RTT
        this._depthTexture = null;

        // RTT Cams
        this._rttCamera = null;

        this._shaders = {};
    };

    Example.prototype = osg.objectInherit( ExampleOSGJS.prototype, {

        createScene: function () {

            var group = new osg.MatrixTransform();
            group.setName( 'group' );

            var ground = osg.createTexturedBoxGeometry( 0.0, 0.0, 0.0, 4.0, 4.0, 0.0 );
            ground.setName( 'groundBox' );

            var box = osg.createTexturedBoxGeometry( 0.0, 0.0, 0.0, 1.0, 1.0, 1.0 );
            box.setName( 'Box' );

            group.addChild( ground );
            group.addChild( box );

            return group;
        },

        getRstatsOptions: function () {

            var values = {
                ssao: {
                    caption: 'ssao',
                    average: true
                },
                blurh: {
                    caption: 'blurh',
                    average: true
                },
                blurv: {
                    caption: 'blurv',
                    average: true
                }
            };

            var group = [ {
                caption: 'SSAO Postprocess',
                values: [ 'mipmap', 'ssao', 'blurh', 'blurv' ]
            } ];

            return {
                values: values,
                groups: group
            };

        },

        createViewer: function () {
            this._canvas = document.getElementById( 'View' );
            this._viewer = new osgViewer.Viewer( this._canvas, {
                rstats: this.getRstatsOptions()
            } );
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
                'mipmapFragment.glsl',
                'ssaoVertex.glsl',
                'ssaoFragment.glsl',
                'blurFragment.glsl',
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

                defer.resolve();

            } );

            return defer.promise;
        },

        createTexture: function ( name, filter, type, size ) {

            var texture = new osg.Texture();
            texture.setInternalFormatType( type );
            texture.setTextureSize( Math.floor( size.width ), Math.floor( size.height ) );

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
                camera.setClearColor( osg.vec4.fromValues( 0.0, 0.0, 0.0, 1.0 ) );

            } else {

                camera.setClearMask( 0 );

            }

            return camera;

        },

        createDepthCameraRTT: function () {

            var rttSize = {
                width: this._canvas.width,
                height: this._canvas.height
            };
            var rttDepth = this.createTexture( 'rttDepth', Texture.NEAREST, Texture.UNSIGNED_BYTE, rttSize );
            this._depthTexture = rttDepth;

            var cam = this.createCameraRTT( rttDepth, true );
            cam.setComputeNearFar( true );

            // Set uniform to render depth
            var stateSetCam = cam.getOrCreateStateSet();
            stateSetCam.setAttributeAndModes( this._shaders.depth );
            stateSetCam.addUniform( this._aoUniforms.uNear );
            stateSetCam.addUniform( this._aoUniforms.uFar );

            this._rttCamera = cam;
            return cam;
        },

        createComposer: function () {

            var composer = new osgUtil.Composer();

            var mipmapFragment = shaderProcessor.getShader( 'mipmapFragment.glsl' );
            var aoVertex = shaderProcessor.getShader( 'ssaoVertex.glsl' );
            var aoFragment = shaderProcessor.getShader( 'ssaoFragment.glsl' );
            var blurFragment = shaderProcessor.getShader( 'blurFragment.glsl' );

            // The composer makes 3 passes
            // 1. noisy AO to texture
            // 2. horizontal blur on the AO texture
            // 3. vertical blur on the previously blured texture

            // Creates AO textures for each pass
            var rttSize = {
                width: this._canvas.width,
                height: this._canvas.height
            };
            var rttMipmapSize = {
                width: this._canvas.width,
                height: this._canvas.height * 1.5
            };
            var rttMipmap = this.createTexture( 'rttMipmapTexture', Texture.NEAREST, Texture.UNSIGNED_BYTE, rttMipmapSize );
            var rttAo = this.createTexture( 'rttAoTexture', Texture.NEAREST, Texture.UNSIGNED_BYTE, rttSize );
            var rttAoHorizontalFilter = this.createTexture( 'rttAoTextureHorizontal', Texture.LINEAR, Texture.UNSIGNED_BYTE, rttSize );
            var rttAoVerticalFilter = this.createTexture( 'rttAoTextureVertical', Texture.LINEAR, Texture.UNSIGNED_BYTE, rttSize );

            this._mipmapUniforms.uViewport.setFloat2( [ rttSize.width, rttSize.height ] );
            this._mipmapUniforms.uDepthTexture = this._depthTexture;

            var mipmapPass = new osgUtil.Composer.Filter.Custom( mipmapFragment, this._mipmapUniforms );

            this._aoUniforms.uDepthTexture = rttMipmap;
            var aoPass = new osgUtil.Composer.Filter.Custom( aoFragment, this._aoUniforms );
            aoPass.setVertexShader( aoVertex );

            this._blurUniforms.uAoTexture = rttAo;
            this._blurUniforms.uAxis.setInt2( [ 1, 0 ] );
            var blurHorizontalPass = new osgUtil.Composer.Filter.Custom( blurFragment, this._blurUniforms );

            this._blurVerticalUniforms.uAoTexture = rttAoHorizontalFilter;
            this._blurVerticalUniforms.uAxis.setInt2( [ 0, 1 ] );
            var blurVerticalPass = new osgUtil.Composer.Filter.Custom( blurFragment, this._blurVerticalUniforms );

            this._aoTexture = rttAo;
            this._aoBluredTexture = rttAoVerticalFilter;
            this._currentAoTexture = this._aoBluredTexture;

            composer.addPass( mipmapPass, rttMipmap ).setFragmentName( 'mipmap' );
            composer.addPass( aoPass, rttAo ).setFragmentName( 'ssao' );
            composer.addPass( blurHorizontalPass, rttAoHorizontalFilter ).setFragmentName( 'blurh' );
            composer.addPass( blurVerticalPass ).setFragmentName( 'blurv' );

            composer.renderToScreen( this._canvas.width, this._canvas.height );
            composer.build();

            var timerGPU = OSG.osg.TimerGPU.instance();
            var cameras = composer.getChildren();
            var nbCameras = cameras.length;

            // DEBUG
            for ( var i = 0; i < nbCameras; ++i ) {
                var cam = cameras[ i ];
                var name = cam.getName();

                cam.setInitialDrawCallback( timerGPU.start.bind( timerGPU, name ) );
                cam.setFinalDrawCallback( timerGPU.end.bind( timerGPU, name ) );
            }
            // END DEBUG

            return composer;
        },

        updateIntData: function ( uniform, value ) {

            uniform.setInt( value );

        },

        updateBooleanData: function ( uniform, value ) {

            uniform.setInt( value ? 1 : 0 );

        },

        updateFloatData: function ( uniform, callback, value ) {

            uniform.setFloat( value );

            if ( callback )
                callback( value );

        },

        updateScale: function () {

            var scale = this._config.scale;

            var matrixTransform = this._modelsMap[ this._config.scene ];
            var prevBsRadius = matrixTransform.getBoundingSphere().radius();

            osg.mat4.fromScaling( matrixTransform.getMatrix(), [ scale, scale, scale ] );

            this.normalizeSliders( prevBsRadius );
        },

        updateBlur: function () {
            if ( this._config.blur ) this._currentAoTexture = this._aoBluredTexture;
            else this._currentAoTexture = this._aoTexture;
        },

        updateRadius: function () {
            var value = this._config.radius;

            var uniform = this._aoUniforms.uRadius;
            var radius2Uniform = this._aoUniforms.uRadius2;
            var invRadiusUniform = this._blurUniforms.uInvRadius;

            this.updateFloatData( uniform, null, value );
            this.updateFloatData( radius2Uniform, null, value * value );
            // Blur needs to take the radius into account
            this.updateFloatData( invRadiusUniform, null, 1.0 / value );
            // Intensity is dependent from the radius
            this.updateIntensity();
        },

        updateBias: function () {

            var uniform = this._aoUniforms.uBias;
            var value = this._config.bias;

            this.updateFloatData( uniform, null, value );

        },

        updateIntensity: function () {
            var uniform = this._aoUniforms.uIntensityDivRadius6;
            var intensity = this._config.intensity;

            var value = intensity / Math.pow( this._config.radius, 6 );
            uniform.setFloat( value );
        },

        normalizeSliders: function ( prevBsRadius ) {

            var node = this._modelsMap[ this._config.scene ];
            node.dirtyBound();

            var sceneRadius = node.getBoundingSphere().radius();
            var scale = this._baseSceneRadius;

            var ssaoFolder = this._gui.__folders.SSAO;
            var ssaoControllers = ssaoFolder.__controllers;

            var radBounds = this._baseSlidersBounds.radius;
            var biasBounds = this._baseSlidersBounds.bias;
            var intenBounds = this._baseSlidersBounds.intensity;

            var radiusCont = ssaoControllers.filter( function ( cont ) {
                return cont.property === 'radius';
            } )[ 0 ];
            var biasCont = ssaoControllers.filter( function ( cont ) {
                return cont.property === 'bias';
            } )[ 0 ];
            var intensityCont = ssaoControllers.filter( function ( cont ) {
                return cont.property === 'intensity';
            } )[ 0 ];

            // Updates the bounds of the sliders
            radiusCont.__min = ( radBounds[ 0 ] * sceneRadius ) / scale;
            radiusCont.__max = ( radBounds[ 1 ] * sceneRadius ) / scale;
            biasCont.__min = ( biasBounds[ 0 ] * sceneRadius ) / scale;
            biasCont.__max = ( biasBounds[ 1 ] * sceneRadius ) / scale;
            intensityCont.__min = ( intenBounds[ 0 ] * sceneRadius ) / scale;
            intensityCont.__max = ( intenBounds[ 1 ] * sceneRadius ) / scale;

            if ( prevBsRadius ) {

                this._config.radius = ( sceneRadius * this._config.radius ) / prevBsRadius;
                this._config.bias = ( sceneRadius * this._config.bias ) / prevBsRadius;
                this._config.intensity = ( sceneRadius * this._config.intensity ) / prevBsRadius;

            } else {

                this._config.radius = radiusCont.__min;
                this._config.bias = biasCont.__min;
                this._config.intensity = intensityCont.__min;

            }

            radiusCont.updateDisplay();
            biasCont.updateDisplay();
            intensityCont.updateDisplay();

            this.updateRadius();

            this._globalUniforms.uBoundingSphereRadius.setFloat( sceneRadius );
            console.log( sceneRadius );
        },

        createSSAOGUI: function ( ssaoFolder, slidersBounds ) {

            var radiusBounds = slidersBounds.radius;
            var biasBounds = slidersBounds.bias;
            var intensityBounds = slidersBounds.intensity;

            //ssaoFolder.add( this._config, 'ssao' )
            //    .onChange( this.updateBooleanData.bind( this, this._standardUniforms.uAoFactor ) );
            ssaoFolder.add( this._config, 'fallOfMethod', this._fallOfMethods )
                .onChange( this.updateIntData.bind( this, this._aoUniforms.uFallOfMethod ) );
            ssaoFolder.add( this._config, 'radius', radiusBounds[ 0 ], radiusBounds[ 1 ] )
                .onChange( this.updateRadius.bind( this ) );
            ssaoFolder.add( this._config, 'bias', biasBounds[ 0 ], biasBounds[ 1 ] )
                .onChange( this.updateBias.bind( this ) );
            ssaoFolder.add( this._config, 'intensity', intensityBounds[ 0 ], intensityBounds[ 1 ] )
                .onChange( this.updateIntensity.bind( this ) );
        },

        initDatGUI: function () {

            this._gui = new window.dat.GUI();
            var gui = this._gui;

            var sceneFolder = gui.addFolder( 'Scene' );
            var ssaoFolder = gui.addFolder( 'SSAO' );
            var blurFolder = gui.addFolder( 'Blur' );

            sceneFolder.add( this._config, 'scale', 1.0, 500.0 )
                .onChange( this.updateScale.bind( this ) );
            sceneFolder.add( this._config, 'scene', this._modelList )
                .onChange( this.updateScene.bind( this, this._config.scene ) );

            console.log( sceneFolder );

            // Fills the SSAO GUI section
            this.createSSAOGUI( ssaoFolder, this._baseSlidersBounds );

            // Fills the blur GUI section
            blurFolder.add( this._config, 'blur' )
                .onChange( this.updateBlur.bind( this ) );
            blurFolder.add( this._config, 'crispness', 0.1, 2.5 )
                .onChange( this.updateFloatData.bind( this, this._blurUniforms.uCrispness, null ) );

        },

        run: function () {

            var self = this;

            this.initDatGUI();
            this.createViewer();

            this.readShaders().then( function () {

                var rootCam = self._viewer.getCamera();

                var scene = self.createScene();
                self._modelsMap.box = scene;

                var cam = self.createDepthCameraRTT();
                osg.mat4.copy( cam.getProjectionMatrix(), rootCam.getProjectionMatrix() );
                cam.setClampProjectionMatrixCallback( function ( m, computedNear, computedFar, nearFarRatio ) {

                    this.clampProjectionMatrix( m, computedNear, computedFar, nearFarRatio );

                    osg.mat4.copy( cam.getViewMatrix(), rootCam.getViewMatrix() );
                    osg.mat4.copy( cam.getProjectionMatrix(), m );

                    var viewport = rootCam.getViewport();

                    var frustum = {};
                    osg.mat4.getFrustum( frustum, m );

                    var width = viewport.width() * resolution;
                    var height = viewport.height() * resolution;

                    self._aoUniforms.uNear.setFloat( frustum.zNear );
                    self._aoUniforms.uFar.setFloat( frustum.zFar );

                    // Projection scale
                    var vFov = m[ 15 ] === 1 ? 1.0 : 2.0 / m[ 5 ];
                    var scale = -2.0 * Math.tan( vFov * 0.5 );
                    var projScale = height / scale;
                    self._aoUniforms.uProjScale.setFloat( projScale );

                    self._projectionInfo[ 0 ] = -2.0 / ( width * m[ 0 ] );
                    self._projectionInfo[ 1 ] = -2.0 / ( height * m[ 5 ] );
                    self._projectionInfo[ 2 ] = ( 1.0 - m[ 8 ] ) / m[ 0 ];
                    self._projectionInfo[ 3 ] = ( 1.0 - m[ 9 ] ) / m[ 5 ];

                    self._aoUniforms.uProjectionInfo.setFloat4( self._projectionInfo );

                } );
                cam.setName( 'DepthCamera' );

                self.updateScene();

                var composerNode = new osg.Node();
                composerNode.setName( 'ComposerNode' );
                composerNode.addChild( self.createComposer() );

                var root = new osg.Node();
                root.addChild( cam );
                root.addChild( composerNode );

                // Attach global uniforms to the root
                root.getOrCreateStateSet().addUniform( self._globalUniforms.uBoundingSphereRadius );

                self._viewer.getCamera().setClearColor( [ 0.0, 0.0, 0.0, 0.0 ] );
                self._viewer.setSceneData( root );

                // var displayGraph = osgUtil.DisplayGraph.instance();
                // displayGraph.setDisplayGraphRenderer( false );
                // displayGraph.createGraph( root );

            } );


        },

        updateScene: function () {

            var sceneId = this._config.scene;
            var node = this._modelsMap[ sceneId ];

            // Cleans root & camera
            this._rttCamera.removeChildren();
            // Adds the new scene
            this._rttCamera.addChild( node );

            this.normalizeSliders( null );
        },

        addScene: function ( name, scene ) {

            this._modelList.push( name );
            this._modelsMap[ name ] = scene;
            this._config.scene = name;

            var folder = this._gui.__folders.Scene;
            var controllers = folder.__controllers;
            var controller = controllers.filter( function ( cont ) {
                return cont.property === 'scene';
            } )[ 0 ];
            controller = controller.options( this._modelList );
            controller.onChange( this.updateScene.bind( this ) );

            this.updateScene();
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

            var mtr = new osg.MatrixTransform();
            osg.mat4.fromRotation( mtr.getMatrix(), Math.PI / 2, [ 1, 0, 0 ] );

            mtr.addChild( scene );
            mt.addChild( mtr );

            self.addScene( sceneName, mt );
        } );

    };


    window.addEventListener( 'load', function () {
        var example = new Example();
        example.run();
        window.addEventListener( 'dragover', dragOverEvent.bind( example ), false );
        window.addEventListener( 'drop', dropEvent.bind( example ), false );
    }, true );

} )();
