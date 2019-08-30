/*
    Interface to the HTML canvas for regular image annotations.

    2019 Benjamin Kellenberger
*/

class ImageViewport {

    constructor(canvas, disableInteractions) {
        this.canvas = canvas;
        this.loadingText = 'loading...';
        this.ctx = canvas[0].getContext('2d');
        this.validArea = [0, 0, 1, 1];    // may be a part of the canvas if the main image is smaller
        this.viewport = [0, 0, 1, 1];
        this.renderStack = [];
        this.renderStack.sortFun = (function(a, b) {
            if(a.zIndex < b.zIndex) {
                return -1;
            } else if(a.zIndex > b.zIndex) {
                return 1;
            } else {
                return 0;
            }
        });

        this._setupCallbacks();

        // mini-map to be shown in the corner if zoomed in
        this.minimap = new MiniMap('minimap', this,
            0.845, 0.845, 0.15, true);

        // mini-map to be shown at cursor position if enabled
        this.loupe = new MiniViewport('loupe', this,
            null, null, null, null);

        // placeholder for zooming rectangle
        this.zoomRectangle = null;
        
        // viewport interactions
        if(!disableInteractions)
            this._setup_interactions();
    }

    _setupCallbacks() {
        this.callbacks = {};
        for(var i=0; i<window.eventTypes.length; i++) {
            this.callbacks[window.eventTypes[i]] = {};
        }
        this._updateCallbacks();
    }

    _updateCallbacks() {
        var self = this;
        for(var i=0; i<window.eventTypes.length; i++) {
            var type = window.eventTypes[i];
            if(Object.keys(this.callbacks[type]).length == 0) {
                // disable callback
                $(this.canvas).off(type);
            } else {
                // enable callback
                $(this.canvas).off(type);
                $(this.canvas).on(type, function(event) {
                    for(var key in self.callbacks[event.type]) {
                        self.callbacks[event.type][key](event);
                    }
                    if(event.type === 'mouseup') {
                        // reset action, unless in panning or burst mode
                        if(window.uiControlHandler.getAction() != ACTIONS.PAN && !window.uiControlHandler.burstMode)
                            window.uiControlHandler.setAction(ACTIONS.DO_NOTHING);
                    }
                    self.render();
                });
            }
        }
    }


    _zoom(event, amount) {
        var mousePos = this.transformCoordinates(this.getRelativeCoordinates(event),
        'validArea', true);
        var currViewport = this.getViewport();
        var size = [(1+amount)*currViewport[2], (1+amount)*currViewport[3]];
        var pos = [(mousePos[0]-size[0]/2 + currViewport[0])/2, (mousePos[1]-size[1]/2 + currViewport[1])/2];
        this.setViewport([
            pos[0], pos[1],
            size[0], size[1]
        ]);
    }


    __mousedown_event(event) {
        this.mouseButton = event.which;

        this.mousePos = this.transformCoordinates(this.getRelativeCoordinates(event),
                'validArea', true);
        
        if(event.which === 1) {
            // set position if zoom to area and show zooming rectangle
            if(window.uiControlHandler.getAction() === ACTIONS.ZOOM_AREA) {
                // create rectangle
                var style = {
                    strokeColor: '#000000',
                    lineWidth: 2,
                    lineDash: [3, 1]
                };
                this.zoomRectangle = new RectangleElement(
                    'zoomRect', this.mousePos[0], this.mousePos[1], 0, 0, style, false, 100
                );

                this.zoomRectangle._mousedown_event(event, this, true);
            }
        }
    }

    __shift_viewport_auto() {
        /*
            Automatically shifts the viewport if the mouse is being dragged towards
            the borders. Does so with a delay and then repeatedly.
        */
        var self = this;
        var _do_shift = function() {
            var repeat = false;
            if(self.mouseButton > 0) {
                var vp = self.getViewport();
                if(self.mousePos[0] <= 0.05) {
                    vp[0] -= 0.01;
                    repeat = true;
                } else if(self.mousePos[0] >= 0.95) {
                    vp[0] += 0.01;
                    repeat = true;
                }
                if(self.mousePos[1] <= 0.05) {
                    vp[1] -= 0.01;
                    repeat = true;
                } else if(self.mousePos[1] >= 0.95) {
                    vp[1] += 0.01;
                    repeat = true;
                }
                self.setViewport(vp);
            } else {
                repeat = false;
            }
            if(repeat) {
                setTimeout(_do_shift, 100);
            }
        }
        _do_shift();
    }

    __mousemove_event(event) {
        // update position and extent shown of loupe
        var canvasMousePos = this.transformCoordinates(this.getRelativeCoordinates(event),
            'canvas', true);
        var newMousePos = this.transformCoordinates(this.getRelativeCoordinates(event),
            'validArea', true);
        this.loupe.setPosition(canvasMousePos[0] - 0.2,
            canvasMousePos[1] - 0.2,
            0.4);
        this.loupe.setParentExtent([
            canvasMousePos[0] - 0.05,
            canvasMousePos[1] - 0.05,
            canvasMousePos[0] + 0.05,
            canvasMousePos[1] + 0.05
        ]);

        // ditto for zoom rectangle
        if(this.zoomRectangle != null) {
            this.zoomRectangle._mousemove_event(event, this, true);
        }
        
        if(this.mousePos != undefined && (this.mouseButton === 2 || (this.mouseButton != 0 && window.uiControlHandler.getAction() === ACTIONS.PAN))) {
            // pan around if middle mouse button pressed or if the "pan" button is active
            var diffX = newMousePos[0] - this.mousePos[0];
            var diffY = newMousePos[1] - this.mousePos[1];
            var vp = this.getViewport();
            vp[0] -= diffX * this.viewport[2];
            vp[1] -= diffY * this.viewport[3];
            this.setViewport(vp);

        } else {
            // adjust viewport if mouse is approaching borders
            this.__shift_viewport_auto();
        }

        // update cursor
        this.canvas.css('cursor', window.uiControlHandler.getDefaultCursor());

        this.mousePos = newMousePos;
    }


    __mousewheel_event(event) {
        // zoom in or out
        var delta = event.originalEvent.deltaY;
        if(delta > 0) {
            this._zoom(event, 0.05);
        } else {
            this._zoom(event, -0.05);
        }
    }


    __mouseup_event(event) {
        this.mouseButton = 0;

        // zoom functionality
        if(window.uiControlHandler.getAction() === ACTIONS.ZOOM_IN) {
            this._zoom(event, -0.2);
        } else if(window.uiControlHandler.getAction() === ACTIONS.ZOOM_OUT) {
            this._zoom(event, 0.2);
        } else if(window.uiControlHandler.getAction() === ACTIONS.ZOOM_AREA) {
            // zoom to area spanned by rectangle
            var ext = this.zoomRectangle.getExtent();
            if(ext[2] - ext[0] > 0 && ext[3] - ext[1] > 0) {
                this.setViewport([
                    ext[0], ext[1],
                    ext[2]-ext[0], ext[3]-ext[1]
                ]);
            }
        }

        this.canvas.css('cursor', window.uiControlHandler.getDefaultCursor());

        // destroy zoom rectangle
        this.zoomRectangle = null;

        this.mousePos = null;
    }


    __mouseleave_event(event) {
        if(window.uiControlHandler.getAction() === ACTIONS.ZOOM_AREA && this.zoomRectangle != null) {
            // zoom to area spanned by rectangle
            var ext = this.zoomRectangle.getExtent();
            this.setViewport([
                ext[0], ext[1],
                ext[2]-ext[0], ext[3]-ext[1]
            ]);
            // window.uiControlHandler.setAction(ACTIONS.DO_NOTHING);
            this.zoomRectangle = null;
        }
        this.mouseButton = 0;

        // "hide" loupe
        this.loupe.setPosition(null, null, null);
    }


    __get_callback(type) {
        var self = this;
        if(type === 'mousedown') {
            return function(event) {
                self.__mousedown_event(event);
            };
        } else if(type ==='mousemove') {
            return function(event) {
                self.__mousemove_event(event);
            };
        } else if(type ==='mouseup') {
            return function(event) {
                self.__mouseup_event(event);
            };
        } else if(type ==='mouseleave') {
            return function(event) {
                self.__mouseleave_event(event);
            };
        } else if(type === 'wheel') {
            return function(event) {
                self.__mousewheel_event(event);
            }
        }
    }


    _setup_interactions() {
        /*
            Sets up generic viewport callbacks for zooming, panning, etc.
        */
        this.addCallback('viewport', 'mousedown', this.__get_callback('mousedown'));
        this.addCallback('viewport', 'mousemove', this.__get_callback('mousemove'));
        this.addCallback('viewport', 'mouseleave', this.__get_callback('mouseleave'));
        this.addCallback('viewport', 'mouseup', this.__get_callback('mouseup'));
        this.addCallback('viewport', 'wheel', this.__get_callback('wheel'));
    }

    addRenderElement(element) {
        if(this.indexOfRenderElement(element) === -1) {
            this.renderStack.push(element);
            this.renderStack.sort(this.renderStack.sortFun);
            this.render();
        }
    }

    indexOfRenderElement(element) {
        return(this.renderStack.indexOf(element));
    }

    updateRenderElement(index, element) {
        this.renderStack[index] = element;
        this.renderStack.sort(this.renderStack.sortFun);
        this.render();
    }

    removeRenderElement(element) {
        var idx = this.renderStack.indexOf(element);
        if(idx !== -1) {
            this.renderStack.splice(idx, 1);
            this.render();
        }
    }

    getAbsoluteCoordinates(event) {
        var posX = event.pageX - this.canvas.offset().left;
        var posY = event.pageY - this.canvas.offset().top;
        return [posX, posY];
    }

    getRelativeCoordinates(event, target) {
        var coords = this.getAbsoluteCoordinates(event);
        return this.transformCoordinates(coords, target, true);
    }

    transformCoordinates(coordinates, target, backwards) {
        /*
            Modifies coordinates w.r.t. either the valid area (typically spanned by the image)
            or the full canvas and transforms relative values (in [0, 1]) forward to full, ab-
            solute values, or else full values back to relative scores if "backwards" is true.

            Note that the forward case uses the hypothetical canvas dimensions, whereas the
            "backwards" case relies on the actual canvas DOM size. This is to account for re-
            lative scaling and mouse/touch gesture capturing.
        */
        var coords_out = coordinates.slice();

        if(backwards) {
            var canvasSize = [this.canvas.width(), this.canvas.height()];
            if(target === 'canvas') {
                coords_out[0] /= canvasSize[0];
                coords_out[1] /= canvasSize[1];
                if(coords_out.length == 4) {
                    coords_out[2] /= canvasSize[0];
                    coords_out[3] /= canvasSize[1];
                }

            } else if(target === 'validArea') {
                var validSize = [this.validArea[2]*canvasSize[0], this.validArea[3]*canvasSize[1]];
                coords_out[0] = (coords_out[0] - (this.validArea[0]*canvasSize[0])) / validSize[0];
                coords_out[1] = (coords_out[1] - (this.validArea[1]*canvasSize[1])) / validSize[1];
                if(coords_out.length == 4) {
                    coords_out[2] /= validSize[0];
                    coords_out[3] /= validSize[1];
                }

                // adjust coordinates according to viewport
                coords_out[0] = (coords_out[0] * this.viewport[2]) + this.viewport[0];
                coords_out[1] = (coords_out[1] * this.viewport[3]) + this.viewport[1];
                if(coords_out.length == 4) {
                    coords_out[2] *= this.viewport[2];
                    coords_out[3] *= this.viewport[3];
                }
            }

        } else {

            var canvasSize = [this.canvas[0].width, this.canvas[0].height];
            if(target === 'canvas') {
                coords_out[0] *= canvasSize[0];
                coords_out[1] *= canvasSize[1];
                if(coords_out.length == 4) {
                    coords_out[2] *= canvasSize[0];
                    coords_out[3] *= canvasSize[1];
                }
            } else if(target === 'validArea') {

                    // adjust coordinates according to viewport
                coords_out[0] = (coords_out[0] - this.viewport[0]) / this.viewport[2];
                coords_out[1] = (coords_out[1] - this.viewport[1]) / this.viewport[3];
                if(coords_out.length == 4) {
                    coords_out[2] /= this.viewport[2];
                    coords_out[3] /= this.viewport[3];
                }

                var validSize = [this.validArea[2]*canvasSize[0], this.validArea[3]*canvasSize[1]];
                coords_out[0] = (coords_out[0]*validSize[0]) + (this.validArea[0]*canvasSize[0]);
                coords_out[1] = (coords_out[1]*validSize[1]) + (this.validArea[1]*canvasSize[1]);
                if(coords_out.length == 4) {
                    coords_out[2] *= validSize[0];
                    coords_out[3] *= validSize[1];
                }
            }
        }
        return coords_out;
    }

    render() {
        // clear canvas
        var extent = [0, 0, this.canvas[0].width, this.canvas[0].height];
        this.ctx.fillStyle = window.styles.background;
        this.ctx.fillRect(0, 0, extent[2], extent[3]);

        // show loading text
        this.ctx.font = '20px sans-serif';
        var dimensions = this.ctx.measureText(this.loadingText);
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillText(this.loadingText, this.canvas[0].width/2 - dimensions.width/2, this.canvas[0].height/2);

        // iterate through render stack
        for(var i=0; i<this.renderStack.length; i++) {
            this.renderStack[i].render(this.ctx, (this.transformCoordinates).bind(this));
        }

        // show zoom rectangle if present
        if(this.zoomRectangle != null) {
            this.zoomRectangle.render(this.ctx, (this.transformCoordinates).bind(this));
        }

        // show minimap if zoomed
        if(this.viewport[0] != 0 || this.viewport[1] != 0 ||
            this.viewport[2] != 1 || this.viewport[3] != 1) {
            this.minimap.render(this.ctx, (this.transformCoordinates).bind(this));
        }

        // show loupe if enabled
        if(window.uiControlHandler.loupeVisible()) {
            this.loupe.render(this.ctx, (this.transformCoordinates).bind(this));
        }
    }

    getViewport() {
        return this.viewport;
    }

    setViewport(viewport) {
        // make sure aspect ratio stays the same
        var size = Math.min(1,Math.max(viewport[2], viewport[3]));
        viewport[0] = Math.min(1-size, Math.max(0, viewport[0]));
        viewport[1] = Math.min(1-size, Math.max(0, viewport[1]));
        viewport[2] = Math.max(0.01, Math.min(1-viewport[0], size));
        viewport[3] = Math.max(0.01, Math.min(1-viewport[1], size));
        this.viewport = viewport;
        this.render();
    }

    resetViewport() {
        this.viewport = [0, 0, 1, 1];
        this.render();
    }

    setValidArea(area) {
        this.validArea = area;
        this.render();
    }

    setMinimapVisible(visible) {
        this.minimap.setVisible(visible);
        this.render();
    }

    addCallback(id, type, callbackFun) {
        if(!(id in this.callbacks[type])) {
            this.callbacks[type][id] = callbackFun;
            this._updateCallbacks();
        }
    }

    removeCallback(id, type) {
        if(id in this.callbacks[type]) {
            delete this.callbacks[type][id];
            this._updateCallbacks();
        }
    }
}