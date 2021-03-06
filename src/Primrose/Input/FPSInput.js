const DISPLACEMENT = new THREE.Vector3(),
  EULER_TEMP = new THREE.Euler(),
  WEDGE = Math.PI / 3,
  TELEPORT_COOLDOWN = 250;

pliny.class({
  parent: "Primrose.Input",
    name: "FPSInput",
    description: "| [under construction]"
});
class FPSInput {
  constructor(DOMElement, options) {
    DOMElement = DOMElement || window;
    this.options = options;
    this.listeners = {
      zero: [],
      motioncontroller: [],
      gamepad: []
    };

    this.managers = [];
    this.newState = [];
    this.pointers = [];
    this.motionDevices = [];
    this.velocity = new THREE.Vector3();
    this.matrix = new THREE.Matrix4();

    const keyUp = (evt) => this.currentControl && this.currentControl.keyUp && this.currentControl.keyUp(evt);
    const keyDown = (evt) => this.Keyboard.doTyping(this.currentControl && this.currentControl.focusedElement, evt);

    this.add(new Primrose.Input.Keyboard(this, {
      strafeLeft: {
        buttons: [-Primrose.Keys.A, -Primrose.Keys.LEFTARROW]
      },
      strafeRight: {
        buttons: [
          Primrose.Keys.D,
          Primrose.Keys.RIGHTARROW
        ]
      },
      strafe: {
        commands: ["strafeLeft", "strafeRight"]
      },
      boost: {
        buttons: [Primrose.Keys.E],
        scale: 0.2
      },
      driveForward: {
        buttons: [-Primrose.Keys.W, -Primrose.Keys.UPARROW]
      },
      driveBack: {
        buttons: [
          Primrose.Keys.S,
          Primrose.Keys.DOWNARROW
        ]
      },
      drive: {
        commands: ["driveForward", "driveBack"]
      },
      select: {
        buttons: [Primrose.Keys.ENTER]
      },
      dSelect: {
        buttons: [Primrose.Keys.ENTER],
        delta: true
      },
      zero: {
        buttons: [Primrose.Keys.Z],
        metaKeys: [-Primrose.Keys.CTRL, -Primrose.Keys.ALT, -Primrose.Keys.SHIFT, -Primrose.Keys.META],
        commandUp: emit.bind(this, "zero")
      }
    }));

    this.Keyboard.addEventListener("keydown", keyDown);
    this.Keyboard.addEventListener("keyup", keyUp);

    this.add(new Primrose.Input.Touch(DOMElement, {
      buttons: {
        axes: ["FINGERS"]
      },
      dButtons: {
        axes: ["FINGERS"],
        delta: true
      },
      dx: {
        axes: ["X0"],
        delta: true,
        scale: -0.005,
        min: -5,
        max: 5
      },
      heading: {
        commands: ["dx"],
        integrate: true
      },
      dy: {
        axes: ["Y0"],
        delta: true,
        scale: -0.005,
        min: -5,
        max: 5
      },
      pitch: {
        commands: ["dy"],
        integrate: true,
        min: -Math.PI * 0.5,
        max: Math.PI * 0.5
      }
    }));

    this.add(new Primrose.Input.Mouse(DOMElement, {
      buttons: {
        axes: ["BUTTONS"]
      },
      dButtons: {
        axes: ["BUTTONS"],
        delta: true
      },
      dx: {
        axes: ["X"],
        delta: true,
        scale: -0.005,
        min: -5,
        max: 5
      },
      heading: {
        metaKeys: [-Primrose.Keys.CTRL, -Primrose.Keys.ALT, -Primrose.Keys.SHIFT, -Primrose.Keys.META],
        commands: ["dx"],
        integrate: true
      },
      dy: {
        axes: ["Y"],
        delta: true,
        scale: -0.005,
        min: -5,
        max: 5
      },
      pitch: {
        metaKeys: [-Primrose.Keys.CTRL, -Primrose.Keys.ALT, -Primrose.Keys.SHIFT, -Primrose.Keys.META],
        commands: ["dy"],
        integrate: true,
        min: -Math.PI * 0.5,
        max: Math.PI * 0.5
      }
    }));

    this.add(new Primrose.Input.VR(this.options.avatarHeight));

    this.motionDevices.push(this.VR);

    Primrose.Input.Gamepad.addEventListener("gamepadconnected", (pad) => {
      var padID = Primrose.Input.Gamepad.ID(pad),
        mgr;

      if (padID !== "Unknown" && padID !== "Rift") {
        if (!!pad.pose) {
          var controllerNumber = 0;
          for (var i = 0; i < this.managers.length; ++i) {
            mgr = this.managers[i];
            if (mgr.currentPad && mgr.currentPad.id === pad.id) {
              ++controllerNumber;
            }
          }

          mgr = new Primrose.Input.Gamepad(pad, controllerNumber, {
            buttons: {
              axes: ["BUTTONS"]
            },
            dButtons: {
              axes: ["BUTTONS"],
              delta: true
            },
            zero: {
              buttons: [Primrose.Input.Gamepad.VIVE_BUTTONS.GRIP_PRESSED],
              commandUp: emit.bind(this, "zero")
            }
          });

          this.add(mgr);
          this.motionDevices.push(mgr);

          var shift = (this.motionDevices.length - 2) * 8,
            color = 0x0000ff << shift,
            emission = 0x00007f << shift,
            ptr = new Primrose.Pointer(padID + "Pointer", color, emission, [mgr]);

          ptr.add(textured(box(0.1, 0.025, 0.2), color, {
            emissive: emission
          }));

          this.pointers.push(ptr);
          ptr.addToBrowserEnvironment(null, this.options.scene);
          ptr.addEventListener("teleport", this.teleport);
        }
        else {
          mgr = new Primrose.Input.Gamepad(pad, 0, {
            buttons: {
              axes: ["BUTTONS"]
            },
            dButtons: {
              axes: ["BUTTONS"],
              delta: true
            },
            strafe: {
              axes: ["LSX"],
              deadzone: 0.2
            },
            drive: {
              axes: ["LSY"],
              deadzone: 0.2
            },
            heading: {
              axes: ["RSX"],
              scale: -1,
              deadzone: 0.2,
              integrate: true
            },
            dHeading: {
              commands: ["heading"],
              delta: true
            },
            pitch: {
              axes: ["RSY"],
              scale: -1,
              deadzone: 0.2,
              integrate: true
            },
            zero: {
              buttons: [Primrose.Input.Gamepad.XBOX_ONE_BUTTONS.BACK],
              commandUp: emit.bind(this, "zero")
            }
          });
          this.add(mgr);
          this.mousePointer.addDevice(mgr, mgr, mgr);
          this.head.addDevice(mgr, mgr, mgr);
        }
      }
    });

    Primrose.Input.Gamepad.addEventListener("gamepaddisconnected", this.remove.bind(this));

    this.stage = new THREE.Object3D();

    this.mousePointer = new Primrose.Pointer("MousePointer", 0xff0000, 0x7f0000, [
      this.Mouse
    ], [
      this.VR,
      this.Keyboard
    ]);
    this.pointers.push(this.mousePointer);
    this.mousePointer.addToBrowserEnvironment(null, this.options.scene);

    this.head = new Primrose.Pointer("GazePointer", 0xffff00, 0x7f7f00, [
      this.VR,
      this.Mouse,
      this.Touch,
      this.Keyboard
    ]);
    this.pointers.push(this.head);
    this.head.addToBrowserEnvironment(null, this.options.scene);

    this.teleport = this.teleport.bind(this);
    this.lastTeleport = 0;
    this.pointers.forEach((ptr) => ptr.addEventListener("teleport", this.teleport));

    this.ready = Promise.all(this.managers
      .map((mgr) => mgr.ready)
      .filter(identity));
  }

  teleport(evt) {
    var t = performance.now(),
      dt = t - this.lastTeleport;
    if(dt > TELEPORT_COOLDOWN) {
      this.lastTeleport = t;
      this.moveStage(evt.position);
    }
  }

  remove(id) {
    var mgr = this[id],
      mgrIdx = this.managers.indexOf(mgr);
    if (mgrIdx > -1) {
      this.managers.splice(mgrIdx, 1);
      delete this[id];
    }
    console.log("removed", mgr);
  }

  add(mgr) {
    for (var i = this.managers.length - 1; i >= 0; --i) {
      if (this.managers[i].name === mgr.name) {
        this.managers.splice(i, 1);
      }
    }
    this.managers.push(mgr);
    this[mgr.name] = mgr;
  }

  zero() {
    for (var i = 0; i < this.managers.length; ++i) {
      this.managers[i].zero();
    }
  }

  get hasMotionControllers() {
    return !!(this.Vive_0 && this.Vive_0.enabled && this.Vive_0.inPhysicalUse ||
      this.Vive_1 && this.Vive_1.enabled && this.Vive_1.inPhysicalUse);
  }

  get hasGamepad() {
    return !!(this.Gamepad_0 && this.Gamepad_0.enabled && this.Gamepad_0.inPhysicalUse);
  }

  get hasMouse() {
    return !!(this.Mouse && this.Mouse.enabled && this.Mouse.inPhysicalUse);
  }

  get hasTouch() {
    return !!(this.Touch && this.Touch.enabled && this.Touch.inPhysicalUse);
  }

  submitFrame() {
    this.VR.submitFrame();
  }

  update(dt) {
    var i;
    this.Keyboard.enabled = this.Touch.enabled = this.Mouse.enabled = !this.hasMotionControllers;
    if (this.Gamepad_0) {
      this.Gamepad_0.enabled = !this.hasMotionControllers;
    }

    var hadGamepad = this.hasGamepad;
    Primrose.Input.Gamepad.poll();
    for (i = 0; i < this.managers.length; ++i) {
      this.managers[i].update(dt);
    }
    if (!hadGamepad && this.hasGamepad) {
      this.Mouse.inPhysicalUse = false;
    }

    this.updateStage(dt);

    // update the motionDevices
    this.stage.updateMatrix();
    this.matrix.multiplyMatrices(this.stage.matrix, this.VR.stage.matrix);
    for (i = 0; i < this.motionDevices.length; ++i) {
      this.motionDevices[i].updateStage(this.matrix);
    }

    for (i = 0; i < this.pointers.length; ++i) {
      this.pointers[i].update();
    }

    if (this.VR.hasOrientation) {
      this.mousePointer.showPointer = (this.hasMouse || this.hasGamepad) && !(this.hasTouch || this.hasMotionControllers);
      this.head.showPointer = true;
    }
    else {
      // if we're not using an HMD, then update the view according to the mouse
      this.head.quaternion.copy(this.mousePointer.quaternion);
      this.head.showPointer = false;
      this.mousePointer.showPointer = true;
    }

    // record the position and orientation of the user
    this.newState = [];
    this.head.updateMatrix();
    this.stage.updateMatrix();
    this.head.position.toArray(this.newState, 0);
    this.stage.quaternion.toArray(this.newState, 3);
    this.head.quaternion.toArray(this.newState, 7);
  }

  updateStage(dt) {
    // get the linear movement from the mouse/keyboard/gamepad
    var heading = 0,
      strafe = 0,
      drive = 0;
    for (var i = 0; i < this.managers.length; ++i) {
      var mgr = this.managers[i];
      heading += mgr.getValue("heading");
      strafe += mgr.getValue("strafe");
      drive += mgr.getValue("drive");
    }

    // move stage according to heading and thrust
    if (this.VR.hasOrientation) {
      heading = WEDGE * Math.floor((heading / WEDGE) + 0.5);
    }

    EULER_TEMP.set(0, heading, 0, "YXZ");
    this.stage.quaternion.setFromEuler(EULER_TEMP);

    // update the stage's velocity
    this.velocity.x = strafe;
    this.velocity.z = drive;

    if (!this.stage.isOnGround) {
      this.velocity.y -= this.options.gravity * dt;
      if (this.stage.position.y < 0) {
        this.velocity.y = 0;
        this.stage.position.y = 0;
        this.stage.isOnGround = true;
      }
    }

    this.moveStage(DISPLACEMENT
      .copy(this.velocity)
      .multiplyScalar(dt)
      .applyQuaternion(this.stage.quaternion)
      .add(this.head.position));
  }

  moveStage(position) {
    DISPLACEMENT.copy(position)
      .sub(this.head.position);
    this.stage.position.x += DISPLACEMENT.x;
    this.stage.position.z += DISPLACEMENT.z;
  }

  get segments() {
    var segments = [];
    for (var i = 0; i < this.pointers.length; ++i) {
      var seg = this.pointers[i].segment;
      if (seg) {
        segments.push(seg);
      }
    }
    return segments;
  }

  get lockMovement() {
    for (var i = 0; i < this.pointers.length; ++i) {
      var ptr = this.pointers[i];
      if (ptr.lockMovement) {
        return true;
      }
    }

    return false;
  }

  get currentControl() {
    for (var i = 0; i < this.pointers.length; ++i) {
      var ptr = this.pointers[i];
      if (ptr.currentControl) {
        return ptr.currentControl;
      }
    }
  }

  resolvePicking(currentHits, lastHits, pickableObjects) {
    for (var i = 0; i < this.pointers.length; ++i) {
      this.pointers[i].resolvePicking(currentHits, lastHits, pickableObjects);
    }
  }

  addEventListener(evt, thunk, bubbles) {
    if (this.listeners[evt]) {
      this.listeners[evt].push(thunk);
    }
    else {
      for (var i = 0; i < this.managers.length; ++i) {
        this.managers[i].addEventListener(evt, thunk, bubbles);
      }
    }
  }
}