// Copyright (c) 2013 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Namespace for the Camera app.
 */
var camera = camera || {};

/**
 * Namespace for utilities.
 */
camera.util = camera.util || {};

/**
 * Creates a tooltip manager for the entire document.
 * @constructor
 */
camera.util.TooltipManager = function() {
  /**
   * @type {camera.util.StyleEffect}
   * @private
   */
  this.effect_ = new camera.util.StyleEffect(
      function(args, callback) {
        this.setTooltipVisibility_(args.element, args.visibility, callback);
      }.bind(this));

  // No more properties. Freeze the object.
  Object.freeze(this);
};

/**
 * Minimal distance from the tooltip to the closest edge in pixels.
 * @type {number}
 * @const
 */
camera.util.TooltipManager.EDGE_MARGIN = 10;

camera.util.TooltipManager.prototype = {
  get animating() {
    return this.effect_.animating;
  }
};

/**
 * Initializes the manager by adding tooltip handlers to every element which
 * has the i18n-label attribute.
 */
camera.util.TooltipManager.prototype.initialize = function() {
  var selectors = document.querySelectorAll('*[i18n-label]');
  for (var index = 0; index < selectors.length; index++) {
    var element = selectors[index];
    element.addEventListener(
        'mouseover', this.showTooltip_.bind(this, element));
    element.addEventListener(
        'focus', this.showTooltip_.bind(this, element));
  }
};

/**
 * Positions the tooltip on the screen and toggles its visibility.
 *
 * @param {HTMLElement} element Element to be the tooltip positioned to.
 * @param {boolean} visible True for visible, false for hidden.
 * @param {function()} callback Completion callback for changing visibility.
 * @private
 */
camera.util.TooltipManager.prototype.setTooltipVisibility_ = function(
    element, visible, callback) {
  var tooltip = document.querySelector('#tooltip');

  // Hide the tooltip.
  if (!visible) {
    tooltip.classList.remove('visible');
    callback();  // No animation, finish immediately.
    return;
  }

  // Show the tooltip.
  // TODO(mtomasz): Support showing near the top edge.
  var tooltipMsg = tooltip.querySelector('#tooltip-msg');
  var tooltipArrow = tooltip.querySelector('#tooltip-arrow');

  var elementRect = element.getBoundingClientRect();
  var elementCenter = elementRect.left + element.offsetWidth / 2;
  tooltip.style.top = elementRect.top - tooltip.offsetHeight + 'px';

  // Center over the element, but avoid touching edges.
  var left = Math.min(
      Math.max(elementCenter - tooltip.clientWidth / 2,
               camera.util.TooltipManager.EDGE_MARGIN),
      document.body.offsetWidth - tooltip.offsetWidth -
          camera.util.TooltipManager.EDGE_MARGIN);
  tooltip.style.left = Math.round(left) + 'px';

  // Align the arrow to point to the element.
  tooltipArrow.style.left = Math.round(elementCenter - left) + 'px';

  // Show the tooltip element.
  tooltip.classList.add('visible');
  camera.util.waitForTransitionCompletion(tooltip, 1000, callback);
};

/**
 * Shows a tooltip over the element.
 * @param {HTMLElement} element Element to be shown.
 * @private
 */
camera.util.TooltipManager.prototype.showTooltip_ = function(element) {
  var tooltip = document.querySelector('#tooltip');
  var tooltipMsg = tooltip.querySelector('#tooltip-msg');
  var tooltipArrow = tooltip.querySelector('#tooltip-arrow');

  this.effect_.invoke(false, function() {});
  tooltipMsg.textContent = chrome.i18n.getMessage(
      element.getAttribute('i18n-label'));

  var hideTooltip = function() {
    this.effect_.invoke({
      element: element,
      visibility: false
    }, function() {});
    element.removeEventListener('mouseout', hideTooltip);
    element.removeEventListener('click', hideTooltip);
    element.removeEventListener('blur', hideTooltip);
  }.bind(this);

  element.addEventListener('mouseout', hideTooltip);
  element.addEventListener('click', hideTooltip);
  element.addEventListener('blur', hideTooltip);

  // Show the tooltip after 500ms.
  this.effect_.invoke({
    element: element,
    visibility: true
  }, function() {}, 500);
};

/**
 * Gets the clockwise rotation and flip that can orient a photo to its upright
 * position.
 * @param {Blob} blob JPEG blob that might contain EXIF orientation field.
 * @return {Promise<Object{rotation: number, flip: boolean}>}
 */
camera.util.getPhotoOrientation = function(blob) {
  let getOrientation = new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = function(event) {
      let view = new DataView(event.target.result);
      if (view.getUint16(0, false) != 0xFFD8) {
        resolve(1);
        return;
      }
      let length = view.byteLength, offset = 2;
      while (offset < length) {
        if (view.getUint16(offset + 2, false) <= 8) {
          break;
        }
        let marker = view.getUint16(offset, false);
        offset += 2;
        if (marker == 0xFFE1) {
          if (view.getUint32(offset += 2, false) != 0x45786966) {
            break;
          }

          let little = view.getUint16(offset += 6, false) == 0x4949;
          offset += view.getUint32(offset + 4, little);
          let tags = view.getUint16(offset, little);
          offset += 2;
          for (let i = 0; i < tags; i++) {
            if (view.getUint16(offset + (i * 12), little) == 0x0112) {
              resolve(view.getUint16(offset + (i * 12) + 8, little));
              return;
            }
          }
        } else if ((marker & 0xFF00) != 0xFF00) {
          break;
        } else {
          offset += view.getUint16(offset, false);
        }
      }
      resolve(1);
    };
    reader.readAsArrayBuffer(blob);
  });

  return getOrientation.then(orientation => {
    switch (orientation) {
      case 1:
        return {rotation: 0, flip: false};
      case 2:
        return {rotation: 0, flip: true};
      case 3:
        return {rotation: 180, flip: false};
      case 4:
        return {rotation: 180, flip: true};
      case 5:
        return {rotation: 90, flip: true};
      case 6:
        return {rotation: 90, flip: false};
      case 7:
        return {rotation: 270, flip: true};
      case 8:
        return {rotation: 270, flip: false};
      default:
        return {rotation: 0, flip: false};
    }
  });
};

/**
 * Orients a photo to the upright orientation.
 * @param {Blob} blob Photo as a blob.
 * @param {function(Blob)} onSuccess Success callback with the result photo as
 *     a blob.
 * @param {function()} onFailure Failure callback.
 */
camera.util.orientPhoto = function(blob, onSuccess, onFailure) {
  // TODO(shenghao): Revise or remove this function if it's no longer
  // applicable.
  let drawPhoto = function(original, orientation, onSuccess, onFailure) {
    let canvas = document.createElement('canvas');
    let context = canvas.getContext('2d');
    let canvasSquareLength = Math.max(original.width, original.height);
    canvas.width = canvasSquareLength;
    canvas.height = canvasSquareLength;

    let centerX = canvas.width / 2, centerY = canvas.height / 2;
    context.translate(centerX, centerY);
    context.rotate(orientation.rotation * Math.PI / 180);
    if (orientation.flip) {
      context.scale(-1, 1);
    }
    context.drawImage(original, -original.width / 2, -original.height / 2,
        original.width, original.height);
    if (orientation.flip) {
      context.scale(-1, 1);
    }
    context.rotate(-orientation.rotation * Math.PI / 180);
    context.translate(-centerX, -centerY);

    let outputCanvas = document.createElement('canvas');
    if (orientation.rotation == 90 || orientation.rotation == 270) {
      outputCanvas.width = original.height;
      outputCanvas.height = original.width;
    } else {
      outputCanvas.width = original.width;
      outputCanvas.height = original.height;
    }
    let imageData = context.getImageData(
        (canvasSquareLength - outputCanvas.width) / 2,
        (canvasSquareLength - outputCanvas.height) / 2,
        outputCanvas.width, outputCanvas.height);
    let outputContext = outputCanvas.getContext('2d');
    outputContext.putImageData(imageData, 0, 0);

    outputCanvas.toBlob(function(blob) {
      if (blob) {
        onSuccess(blob);
      } else {
        onFailure();
      }
    }, 'image/jpeg');
  };

  camera.util.getPhotoOrientation(blob).then(orientation => {
    if (orientation.rotation == 0 && !orientation.flip) {
      onSuccess(blob);
    } else {
      let original = document.createElement('img');
      original.onload = function() {
        drawPhoto(original, orientation, onSuccess, onFailure);
      };
      original.onerror = onFailure;
      original.src = URL.createObjectURL(blob);
    }
  });
};

/**
 * Checks the board name if the user is using a chromebook.
 * @param {string} name Board name.
 * @return {!Promise<boolean>} promise Promise with result.
 */
camera.util.isBoard = function(name, callback) {
  if (!chrome.chromeosInfoPrivate) {
    return Promise.resolve(false);
  }

  return new Promise(function(onFulfill, onReject) {
    chrome.chromeosInfoPrivate.get(['board'], function(values) {
      var board = values['board'];
      onFulfill(board && board.indexOf(name) == 0);
    });
  });
};

/**
 * Returns true if current installed Chrome version is larger than or equal to
 * the given version.
 * @param {number} minVersion the version to be compared with.
 * @return {boolean}
 */
camera.util.isChromeVersionAbove = function(minVersion) {
  var match = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);
  return (match ? parseInt(match[2], 10) : 0) >= minVersion;
};

/**
 * Sets localized aria attributes for TTS on the entire document. Uses the
 * dedicated i18n-aria-label attribute as a strings identifier. If it is not
 * found, then i18n-label is used as a fallback.
 */
camera.util.setAriaAttributes = function() {
  var elements = document.querySelectorAll('*[i18n-aria-label], *[i18n-label]');
  for (var index = 0; index < elements.length; index++) {
    var label = elements[index].hasAttribute('i18n-aria-label') ?
        elements[index].getAttribute('i18n-aria-label') :
        elements[index].getAttribute('i18n-label');  // Fallback.

    elements[index].setAttribute('aria-label', chrome.i18n.getMessage(label));
  }
};

/**
 * Sets a class which invokes an animation and calls the callback when the
 * animation is done. The class is released once the animation is finished.
 * If the class name is already set, then calls onCompletion immediately.
 *
 * @param {HTMLElement} classElement Element to be applied the class on.
 * @param {HTMLElement} animationElement Element to be animated.
 * @param {string} className Class name to be added.
 * @param {number} timeout Animation timeout in milliseconds.
 * @param {function()=} opt_onCompletion Completion callback.
 */
camera.util.setAnimationClass = function(
    classElement, animationElement, className, timeout, opt_onCompletion) {
  if (classElement.classList.contains(className)) {
    if (opt_onCompletion)
      opt_onCompletion();
    return;
  }

  classElement.classList.add(className);
  var onAnimationCompleted = function() {
    classElement.classList.remove(className);
    if (opt_onCompletion)
      opt_onCompletion();
  };

  camera.util.waitForAnimationCompletion(
      animationElement, timeout, onAnimationCompleted);
};

/**
 * Waits for animation completion and calls the callback.
 *
 * @param {HTMLElement} animationElement Element to be animated.
 * @param {number} timeout Timeout for completion. 0 for no timeout.
 * @param {function()} onCompletion Completion callback.
 */
camera.util.waitForAnimationCompletion = function(
    animationElement, timeout, onCompletion) {
  var completed = false;
  var onAnimationCompleted = function(opt_event) {
    if (completed || (opt_event && opt_event.target != animationElement))
      return;
    completed = true;
    animationElement.removeEventListener(
        'webkitAnimationEnd', onAnimationCompleted);
    onCompletion();
  };
  if (timeout)
      setTimeout(onAnimationCompleted, timeout);
  animationElement.addEventListener('webkitAnimationEnd', onAnimationCompleted);
};

/**
 * Waits for transition completion and calls the callback.
 *
 * @param {HTMLElement} transitionElement Element to be transitioned.
 * @param {number} timeout Timeout for completion. 0 for no timeout.
 * @param {function()} onCompletion Completion callback.
 */
camera.util.waitForTransitionCompletion = function(
    transitionElement, timeout, onCompletion) {
  var completed = false;
  var onTransitionCompleted = function(opt_event) {
    if (completed || (opt_event && opt_event.target != transitionElement))
      return;
    completed = true;
    transitionElement.removeEventListener(
        'webkitTransitionEnd', onTransitionCompleted);
    onCompletion();
  };
  if (timeout)
      setTimeout(onTransitionCompleted, timeout);
  transitionElement.addEventListener(
      'webkitTransitionEnd', onTransitionCompleted);
};

/**
 * Scrolls the parent of the element so the element is visible.
 *
 * @param {HTMLElement} element Element to be visible.
 * @param {camera.util.SmoothScroller} scroller Scroller to be used.
 * @param {camera.util.SmoothScroller.Mode=} opt_mode Scrolling mode. Default:
 *     SMOOTH.
 */
camera.util.ensureVisible = function(element, scroller, opt_mode) {
  var scrollLeft = scroller.scrollLeft;
  var scrollTop = scroller.scrollTop;

  if (element.offsetTop < scroller.scrollTop)
    scrollTop = Math.round(element.offsetTop - element.offsetHeight * 0.5);
  if (element.offsetTop + element.offsetHeight >
      scrollTop + scroller.clientHeight) {
    scrollTop = Math.round(element.offsetTop + element.offsetHeight * 1.5 -
        scroller.clientHeight);
  }
  if (element.offsetLeft < scroller.scrollLeft)
    scrollLeft = Math.round(element.offsetLeft - element.offsetWidth * 0.5);
  if (element.offsetLeft + element.offsetWidth >
      scrollLeft + scroller.clientWidth) {
    scrollLeft = Math.round(element.offsetLeft + element.offsetWidth * 1.5 -
        scroller.clientWidth);
  }
  scroller.scrollTo(scrollLeft, scrollTop, opt_mode);
};

/**
 * Scrolls the parent of the element so the element is centered.
 *
 * @param {HTMLElement} element Element to be visible.
 * @param {camera.util.SmoothScroller} scroller Scroller to be used.
 * @param {camera.util.SmoothScroller.Mode=} opt_mode Scrolling mode. Default:
 *     SMOOTH.
 */
camera.util.scrollToCenter = function(element, scroller, opt_mode) {
  var scrollLeft = Math.round(element.offsetLeft + element.offsetWidth / 2 -
    scroller.clientWidth / 2);
  var scrollTop = Math.round(element.offsetTop + element.offsetHeight / 2 -
    scroller.clientHeight / 2);

  scroller.scrollTo(scrollLeft, scrollTop, opt_mode);
};

/**
 * Wraps an effect in style implemented as either CSS3 animation or CSS3
 * transition. The passed closure should invoke the effect.
 * Only the last callback, passed to the latest invoke() call will be called
 * on the transition or the animation end.
 *
 * @param {function(*, function())} closure Closure for invoking the effect.
 * @constructor
 */
camera.util.StyleEffect = function(closure) {
  /**
   * @type {function(*, function()}
   * @private
   */
  this.closure_ = closure;

  /**
   * Callback to be called for the latest invokation.
   * @type {?function()}
   * @private
   */
  this.callback_ = null;

  /**
   * @type {?number{
   * @private
   */
  this.invocationTimer_ = null;

  // End of properties. Seal the object.
  Object.seal(this);
};

camera.util.StyleEffect.prototype = {
  get animating() {
    return !!this.callback_;
  }
};

/**
 * Invokes the animation and calls the callback on completion. Note, that
 * the callback will not be called if there is another invocation called after.
 *
 * @param {*} state State of the effect to be set
 * @param {function()} callback Completion callback.
 * @param {number=} opt_delay Timeout in milliseconds before invoking.
 */
camera.util.StyleEffect.prototype.invoke = function(
    state, callback, opt_delay) {
  if (this.invocationTimer_) {
    clearTimeout(this.invocationTimer_);
    this.invocationTimer_ = null;
  }

  var invokeClosure = function() {
    this.callback_ = callback;
    this.closure_(state, function() {
      if (!this.callback_)
        return;
      var callback = this.callback_;
      this.callback_ = null;

      // Let the animation neatly finish.
      setTimeout(callback, 0);
    }.bind(this));
  }.bind(this);

  if (opt_delay !== undefined)
    this.invocationTimer_ = setTimeout(invokeClosure, opt_delay);
  else
    invokeClosure();
};

/**
 * Performs smooth scrolling of a scrollable DOM element using a accelerated
 * CSS3 transform and transition for smooth animation.
 *
 * @param {HTMLElement} element Element to be scrolled.
 * @param {HTMLElement} padder Element holding contents within the scrollable
 *     element.
 * @constructor
 */
camera.util.SmoothScroller = function(element, padder) {
  /**
   * @type {HTMLElement}
   * @private
   */
  this.element_ = element;

  /**
   * @type {HTMLElement}
   * @private
   */
  this.padder_ = padder;

  /**
   * @type {boolean}
   * @private
   */
  this.animating_ = false;

  /**
   * @type {number}
   * @private
   */
  this.animationId_ = 0;

  // End of properties. Seal the object.
  Object.seal(this);
};

/**
 * Smooth scrolling animation duration in milliseconds.
 * @type {number}
 * @const
 */
camera.util.SmoothScroller.DURATION = 500;

/**
 * Mode of scrolling.
 * @enum {number}
 */
camera.util.SmoothScroller.Mode = {
  SMOOTH: 0,
  INSTANT: 1
};

camera.util.SmoothScroller.prototype = {
  get element() {
    return this.element_;
  },
  get animating() {
    return this.animating_;
  },
  get scrollLeft() {
    // TODO(mtomasz): This does not reflect paddings nor margins.
    return -this.padder_.getBoundingClientRect().left;
  },
  get scrollTop() {
    // TODO(mtomasz): This does not reflect paddings nor margins.
    return -this.padder_.getBoundingClientRect().top;
  },
  get scrollWidth() {
    // TODO(mtomasz): This does not reflect paddings nor margins.
    return this.padder_.scrollWidth;
  },
  get scrollHeight() {
    // TODO(mtomasz): This does not reflect paddings nor margins.
    return this.padder_.scrollHeight;
  },
  get clientWidth() {
    // TODO(mtomasz): This does not reflect paddings nor margins.
    return this.element_.clientWidth;
  },
  get clientHeight() {
    // TODO(mtomasz): This does not reflect paddings nor margins.
    return this.element_.clientHeight;
  }
};

/**
 * Flushes the CSS3 transition scroll to real scrollLeft/scrollTop attributes.
 * @private
 */
camera.util.SmoothScroller.prototype.flushScroll_ = function() {
  var scrollLeft = this.scrollLeft;
  var scrollTop = this.scrollTop;

  this.padder_.style.transition = '';
  this.padder_.style.webkitTransform = '';

  this.element_.scrollLeft = scrollLeft;
  this.element_.scrollTop = scrollTop;

  this.animationId_++;  // Invalidate the animation by increasing the id.
  this.animating_ = false;
};

/**
 * Scrolls smoothly to specified position.
 *
 * @param {number} x X Target scrollLeft value.
 * @param {number} y Y Target scrollTop value.
 * @param {camera.util.SmoothScroller.Mode=} opt_mode Scrolling mode. Default:
 *     SMOOTH.
 */
camera.util.SmoothScroller.prototype.scrollTo = function(x, y, opt_mode) {
  var mode = opt_mode || camera.util.SmoothScroller.Mode.SMOOTH;

  // Limit to the allowed values.
  var x = Math.max(0, Math.min(x, this.scrollWidth - this.clientWidth));
  var y = Math.max(0, Math.min(y, this.scrollHeight - this.clientHeight));

  switch (mode) {
    case camera.util.SmoothScroller.Mode.INSTANT:
      // Cancel any current animations.
      if (this.animating_)
        this.flushScroll_();

      this.element_.scrollLeft = x;
      this.element_.scrollTop = y;
      break;

    case camera.util.SmoothScroller.Mode.SMOOTH:
      // Calculate translating offset using the accelerated CSS3 transform.
      var dx = x - this.element_.scrollLeft;
      var dy = y - this.element_.scrollTop;

      var transformString =
          'translate(' + -dx + 'px, ' + -dy + 'px)';

      // If nothing to change, then return.
      if (this.padder_.style.webkitTransform == transformString ||
          (dx == 0 && dy == 0 && !this.padder_.style.webkitTransform)) {
        return;
      }

      // Invalidate previous invocations.
      var currentAnimationId = ++this.animationId_;

      // Start the accelerated animation.
      this.animating_ = true;
      this.padder_.style.transition = '-webkit-transform ' +
          camera.util.SmoothScroller.DURATION + 'ms ease-out';
      this.padder_.style.webkitTransform = transformString;

      // Remove translation, and switch to scrollLeft/scrollTop when the
      // animation is finished.
      camera.util.waitForTransitionCompletion(
          this.padder_,
          0,
          function() {
            // Check if the animation got invalidated by a later scroll.
            if (currentAnimationId == this.animationId_)
              this.flushScroll_();
         }.bind(this));
      break;
  }
};

/**
 * Runs asynchronous closures in a queue.
 * @constructor
 */
camera.util.Queue = function() {
  /**
   * @type {Array.<function(function())>}
   * @private
   */
  this.closures_ = [];

  /**
   * @type {boolean}
   * @private
   */
  this.running_ = false;

  // End of properties. Seal the object.
  Object.seal(this);
};

/**
 * Runs a task within the queue.
 * @param {function(function())} closure Closure to be run with a completion
 *     callback.
 */
camera.util.Queue.prototype.run = function(closure) {
  this.closures_.push(closure);
  if (!this.running_)
    this.continue_();
};

/**
 * Continues executing further enqueued closures, or stops the queue if nothing
 * pending.
 * @private
 */
camera.util.Queue.prototype.continue_ = function() {
  if (!this.closures_.length) {
    this.running_ = false;
    return;
  }

  this.running_ = true;
  var closure = this.closures_.shift();
  closure(this.continue_.bind(this));
};

/**
 * Tracks the mouse for click and move, and the touch screen for touches. If
 * any of these are detected, then the callback is called.
 *
 * @param {HTMLElement} element Element to be monitored.
 * @param {function(Event)} callback Callback triggered on events detected.
 * @constructor
 */
camera.util.PointerTracker = function(element, callback) {
  /**
   * @type {HTMLElement}
   * @private
   */
  this.element_ = element;

  /**
   * @type {function(Event)}
   * @private
   */
  this.callback_ = callback;

  /**
   * @type {Array.<number>}
   * @private
   */
  this.lastMousePosition_ = null;

  // End of properties. Seal the object.
  Object.seal(this);

  // Add the event listeners.
  this.element_.addEventListener('mousedown', this.onMouseDown_.bind(this));
  this.element_.addEventListener('mousemove', this.onMouseMove_.bind(this));
  this.element_.addEventListener('touchstart', this.onTouchStart_.bind(this));
  this.element_.addEventListener('touchmove', this.onTouchMove_.bind(this));
};

/**
 * Handles the mouse down event.
 *
 * @param {Event} event Mouse down event.
 * @private
 */
camera.util.PointerTracker.prototype.onMouseDown_ = function(event) {
  this.callback_(event);
  this.lastMousePosition_ = [event.screenX, event.screenY];
};

/**
 * Handles the mouse move event.
 *
 * @param {Event} event Mouse move event.
 * @private
 */
camera.util.PointerTracker.prototype.onMouseMove_ = function(event) {
  // Ignore mouse events, which are invoked on the same position, but with
  // changed client coordinates. This will happen eg. when scrolling. We should
  // ignore them, since they are not invoked by an actual mouse move.
  if (this.lastMousePosition_ && this.lastMousePosition_[0] == event.screenX &&
      this.lastMousePosition_[1] == event.screenY) {
    return;
  }

  this.callback_(event);
  this.lastMousePosition_ = [event.screenX, event.screenY];
};

/**
 * Handles the touch start event.
 *
 * @param {Event} event Touch start event.
 * @private
 */
camera.util.PointerTracker.prototype.onTouchStart_ = function(event) {
  this.callback_(event);
};

/**
 * Handles the touch move event.
 *
 * @param {Event} event Touch move event.
 * @private
 */
camera.util.PointerTracker.prototype.onTouchMove_ = function(event) {
  this.callback_(event);
};

/**
 * Tracks scrolling and calls a callback, when scrolling is started and ended
 * by either the scroller or the user.
 *
 * @param {camera.util.SmoothScroller} scroller Scroller object to be tracked.
 * @param {function()} onScrollStarted Callback called when scrolling is
 *     started.
 * @param {function()} onScrollEnded Callback called when scrolling is ended.
 * @constructor
 */
camera.util.ScrollTracker = function(scroller, onScrollStarted, onScrollEnded) {
  /**
   * @type {camera.util.SmoothScroller}
   * @private
   */
  this.scroller_ = scroller;

  /**
   * @type {function()}
   * @private
   */
  this.onScrollStarted_ = onScrollStarted;

  /**
   * @type {function()}
   * @private
   */
  this.onScrollEnded_ = onScrollEnded;

  /**
   * Timer to probe for scroll changes, every 100 ms.
   * @type {?number}
   * @private
   */
  this.timer_ = null;

  /**
   * Workaround for: crbug.com/135780.
   * @type {?number}
   * @private
   */
  this.noChangeTimer_ = null;

  /**
   * @type {boolean}
   * @private
   */
  this.scrolling_ = false;

  /**
   * @type {Array.<number>}
   * @private
   */
  this.startScrollPosition_ = [0, 0];

  /**
   * @type {Array.<number>}
   * @private
   */
  this.lastScrollPosition_ = [0, 0];

  /**
   * Whether the touch screen is currently touched.
   * @type {boolean}
   * @private
   */
  this.touchPressed_ = false;

  /**
   * Whether the touch screen is currently touched.
   * @type {boolean}
   * @private
   */
  this.mousePressed_ = false;

  // End of properties. Seal the object.
  Object.seal(this);

  // Register event handlers.
  this.scroller_.element.addEventListener(
      'mousedown', this.onMouseDown_.bind(this));
  this.scroller_.element.addEventListener(
      'touchstart', this.onTouchStart_.bind(this));
  window.addEventListener('mouseup', this.onMouseUp_.bind(this));
  window.addEventListener('touchend', this.onTouchEnd_.bind(this));
};

camera.util.ScrollTracker.prototype = {
  /**
   * @return {boolean} Whether scrolling is being performed or not.
   */
  get scrolling() {
    return this.scrolling_;
  },

  /**
   * @return {Array.<number>} Returns distance of the last detected scroll.
   */
  get delta() {
    return [
      this.startScrollPosition_[0] - this.lastScrollPosition_[0],
      this.startScrollPosition_[1] - this.lastScrollPosition_[1]
    ];
  }
};

/**
 * Handles pressing the mouse button.
 * @param {Event} event Mouse down event.
 * @private
 */
camera.util.ScrollTracker.prototype.onMouseDown_ = function(event) {
  this.mousePressed_ = true;
};

/**
 * Handles releasing the mouse button.
 * @param {Event} event Mouse up event.
 * @private
 */
camera.util.ScrollTracker.prototype.onMouseUp_ = function(event) {
  this.mousePressed_ = false;
};

/**
 * Handles touching the screen.
 * @param {Event} event Mouse down event.
 * @private
 */
camera.util.ScrollTracker.prototype.onTouchStart_ = function(event) {
  this.touchPressed_ = true;
};

/**
 * Handles releasing touching of the screen.
 * @param {Event} event Mouse up event.
 * @private
 */
camera.util.ScrollTracker.prototype.onTouchEnd_ = function(event) {
  this.touchPressed_ = false;
};

/**
 * Starts monitoring.
 */
camera.util.ScrollTracker.prototype.start = function() {
  if (this.timer_ !== null)
    return;
  this.timer_ = setInterval(this.probe_.bind(this), 100);
};

/**
 * Stops monitoring.
 */
camera.util.ScrollTracker.prototype.stop = function() {
  if (this.timer_ === null)
    return;
  clearTimeout(this.timer_);
  this.timer_ = null;
};

/**
 * Probes for scrolling changes.
 * @private
 */
camera.util.ScrollTracker.prototype.probe_ = function() {
  var scrollLeft = this.scroller_.scrollLeft;
  var scrollTop = this.scroller_.scrollTop;

  var scrollChanged =
      scrollLeft != this.lastScrollPosition_[0] ||
      scrollTop != this.lastScrollPosition_[1] ||
      this.scroller_.animating;

  if (scrollChanged) {
    if (!this.scrolling_) {
      this.startScrollPosition_ = [scrollLeft, scrollTop];
      this.onScrollStarted_();
    }
    this.scrolling_ = true;
  } else {
    if (!this.mousePressed_ && !this.touchPressed_ && this.scrolling_) {
      this.onScrollEnded_();
      this.scrolling_ = false;
    }
  }

  // Workaround for: crbug.com/135780.
  // When scrolling by touch screen, the touchend event is not emitted. So, a
  // timer has to be used as a fallback to detect the end of scrolling.
  if (this.touchPressed_) {
    if (scrollChanged) {
      // Scrolling changed, cancel the timer.
      if (this.noChangeTimer_) {
        clearTimeout(this.noChangeTimer_);
        this.noChangeTimer_ = null;
      }
    } else {
      // Scrolling previously, but now no change is detected, so set a timer.
      if (this.scrolling_ && !this.noChangeTimer_) {
        this.noChangeTimer_ = setTimeout(function() {
          this.onScrollEnded_();
          this.scrolling_ = false;
          this.touchPressed_ = false;
          this.noChangeTimer_ = null;
        }.bind(this), 200);
      }
    }
  }

  this.lastScrollPosition_ = [scrollLeft, scrollTop];
};

/**
 * Makes an element scrollable by dragging with a mouse.
 *
 * @param {camera.util.Scroller} scroller Scroller for the element.
 * @constructor
 */
camera.util.MouseScroller = function(scroller) {
  /**
   * @type {camera.util.Scroller}
   * @private
   */
  this.scroller_ = scroller;

  /**
   * @type {Array.<number>}
   * @private
   */
  this.startPosition_ = null;

  /**
   * @type {Array.<number>}
   * @private
   */
  this.startScrollPosition_ = null;

  // End of properties. Seal the object.
  Object.seal(this);

  // Register mouse handlers.
  this.scroller_.element.addEventListener(
      'mousedown', this.onMouseDown_.bind(this));
  window.addEventListener('mousemove', this.onMouseMove_.bind(this));
  window.addEventListener('mouseup', this.onMouseUp_.bind(this));
};

/**
 * Handles the mouse down event on the tracked element.
 * @param {Event} event Mouse down event.
 * @private
 */
camera.util.MouseScroller.prototype.onMouseDown_ = function(event) {
  if (event.which != 1)
    return;

  this.startPosition_ = [event.screenX, event.screenY];
  this.startScrollPosition_ = [
    this.scroller_.scrollLeft,
    this.scroller_.scrollTop
  ];
};

/**
 * Handles moving a mouse over the tracker element.
 * @param {Event} event Mouse move event.
 * @private
 */
camera.util.MouseScroller.prototype.onMouseMove_ = function(event) {
  if (!this.startPosition_)
    return;

  // It may happen that we won't receive the mouseup event, when clicking on
  // the -webkit-app-region: drag area.
  if (event.which != 1) {
    this.startPosition_ = null;
    this.startScrollPosition_ = null;
    return;
  }

  var scrollLeft =
      this.startScrollPosition_[0] - (event.screenX - this.startPosition_[0]);
  var scrollTop =
      this.startScrollPosition_[1] - (event.screenY - this.startPosition_[1]);

  this.scroller_.scrollTo(
      scrollLeft, scrollTop, camera.util.SmoothScroller.Mode.INSTANT);
};

/**
 * Handles the mouse up event on the tracked element.
 * @param {Event} event Mouse down event.
 * @private
 */
camera.util.MouseScroller.prototype.onMouseUp_ = function(event) {
  this.startPosition_ = null;
  this.startScrollPosition_ = null;
};

/**
 * Monitors performance by calculating FPS.
 * @constructor
 */
camera.util.PerformanceMonitor = function() {
  /**
   * Stores an array of probes, as an array of pair (timestamp, duration) of
   * measurements.
   *
   * @type {Array.<number, number>}
   * @private
   */
  this.probes_ = [];

  /**
   * @type {number}
   * @private
   */
  this.tailStartTime_ = performance.now();

  // No more properties, seal the object.
  Object.seal(this);
};

/**
 * Length of history tail in milliseconds. Older probes will be discarded.
 * @type {number}
 * @const
 */
camera.util.PerformanceMonitor.HISTORY_LENGTH = 3 * 1000;

camera.util.PerformanceMonitor.prototype = {
  /**
   * @return {number} Number of measurements per second.
   */
  get fps() {
    return this.tailStartTime_ ? this.probes_.length /
        (performance.now() - this.tailStartTime_) * 1000 : 0;
  },
  /**
   * @return {number} Average measurment duration in ms.
   */
  get average() {
    var result = 0;
    if (!this.probes_.length)
      return 0;
    for (var i = 0; i < this.probes_.length; i++) {
      result += this.probes_[i][1];
    }
    return result / this.probes_.length;
  }
};

/**
 * Resets the monitor.
 */
camera.util.PerformanceMonitor.prototype.reset = function() {
  this.tailStartTime_ = performance.now();
  this.probes_ = [];
};

/**
 * Stars measuring a task execution time.
 * @return {function()} Callback to be called, when the task is finished.
 */
camera.util.PerformanceMonitor.prototype.startMeasuring = function() {
  var startTime = performance.now();
  return this.finishMeasuring_.bind(this, startTime);
};

/**
 * Finishes measuring.
 * @param {number} startTime Start time in milliseconds.
 * @private
 */
camera.util.PerformanceMonitor.prototype.finishMeasuring_ = function(
    startTime) {
  this.probes_.push([performance.now(), performance.now() - startTime]);
  // Discard old probes.
  var threshold =
      performance.now() - camera.util.PerformanceMonitor.HISTORY_LENGTH;
  var i = 0;
  while (i < this.probes_.length && this.probes_[i][0] < threshold) {
    i++;
  }
  if (i > 0) {
    this.tailStartTime_ = this.probes_[i][0];
    this.probes_.splice(0, i);
  }
};

/**
 * Manages multiple monitors in a name-keyed map.
 * @constructor
 */
camera.util.NamedPerformanceMonitors = function() {
  /**
   * @type {Object.<camera.util.PerformanceMonitor}
   * @private
   */
  this.monitors_ = {};

  // No more properties, seal the object.
  Object.seal(this);
};

/**
 * Gets a named monitor. If doesn't exist, then creates it.
 * @param {string} name Identifier.
 * @return {camera.util.PerformanceMonitor}
 * @private
 */
camera.util.NamedPerformanceMonitors.prototype.get_ = function(name) {
  if (!this.monitors_[name])
    this.monitors_[name] = new camera.util.PerformanceMonitor();
  return this.monitors_[name];
};

/**
 * Starts measuring a task execution time for the specific monitor.
 * @param {string} name Identifier.
 * @return {function()} Callback to be called, when the task is finished.
 */
camera.util.NamedPerformanceMonitors.prototype.startMeasuring = function(name) {
  return this.get_(name).startMeasuring();
};

/**
 * Resets all monitors.
 */
camera.util.NamedPerformanceMonitors.prototype.reset = function() {
  Object.keys(this.monitors_).forEach(function(identifier) {
    this.monitors_[identifier].reset();
  }.bind(this));
};

/**
 * Returns a debug string.
 * @return {string} Debug string.
 */
camera.util.NamedPerformanceMonitors.prototype.toDebugString = function() {
  var result = '';
  Object.keys(this.monitors_).forEach(function(identifier) {
    result += identifier + ': ' + this.average(identifier) +
        ' ms @ ' + this.fps(identifier).toPrecision(2) + ' fps\n';
  }.bind(this));
  return result;
};

/**
 * Returns a fps value for the named monitor.
 * @param {string} Identifier.
 * @return {number} Number of frames per second.
 */
camera.util.NamedPerformanceMonitors.prototype.fps = function(name) {
  return this.get_(name).fps;
};

/**
 * Returns an average measurement duration value for the named monitor.
 * @param {string} Identifier.
 * @return {number} Average measurement duration in ms
 */
camera.util.NamedPerformanceMonitors.prototype.average = function(name) {
  return this.get_(name).average;
};

/**
 * Returns a shortcut string, such as Ctrl-Alt-A.
 * @param {Event} event Keyboard event.
 * @return {string} Shortcut identifier.
 */
camera.util.getShortcutIdentifier = function(event) {
  var identifier = (event.ctrlKey ? 'Ctrl-' : '') +
                   (event.altKey ? 'Alt-' : '') +
                   (event.shiftKey ? 'Shift-' : '') +
                   (event.metaKey ? 'Meta-' : '');

  // Handle both KeyboardEvent keyIdentifier and key as keyIdentifier is
  // deprecated since Chrome M54 and key is not supported prior Chrome M51.
  if (event.keyIdentifier && !event.key) {
    switch (event.keyIdentifier) {
      case 'U+001B':
        identifier += 'Escape';
        break;
      case 'U+007F':
        identifier += 'Delete';
        break;
      case 'U+0020':
        identifier += 'Space';
        break;
      case 'U+0041':
        identifier += 'A';
        break;
      case 'U+0050':
        identifier += 'P';
        break;
      case 'U+0053':
        identifier += 'S';
        break;
      case 'U+0047':
        identifier += 'G';
        break;
      default:
        identifier += event.keyIdentifier;
    }
  }

  if (event.key) {
    switch (event.key) {
      case 'ArrowLeft':
        identifier += 'Left';
        break;
      case 'ArrowRight':
        identifier += 'Right';
        break;
      case 'ArrowDown':
        identifier += 'Down';
        break;
      case 'ArrowUp':
        identifier += 'Up';
        break;
      case ' ':
        identifier += 'Space';
        break;
      case 'a':
        identifier += 'A';
        break;
      case 'p':
        identifier += 'P';
        break;
      case 's':
        identifier += 'S';
        break;
      case 'g':
        identifier += 'G';
        break;
      default:
        identifier += event.key;
    }
  }

  return identifier;
};

/**
 * Makes all elements with a tabindex attribute unfocusable by mouse.
 */
camera.util.makeElementsUnfocusableByMouse = function() {
  var elements = document.querySelectorAll('[tabindex]');
  for (var index = 0; index < elements.length; index++) {
    elements[index].addEventListener('mousedown', function(event) {
      event.preventDefault();
    });
  }
};

/**
 * Makes the elements pullable via touch and mouse. Only vertical orientation is
 * currently supported.
 *
 * @param {HTMLElement} wrapper Wrapper of the element to be used for
 *     positioning while pulling.
 * @param {HTMLElement} element Element to be made pullable.
 * @param {function(number)} onPullReleased Callback with the pulling distance
 *     in percent points.
 * @constructor
 */
camera.util.Puller = function(wrapper, element, onPullReleased) {
  /**
   * @type {HTMLElement} element
   * @private
   */
  this.wrapper_ = wrapper;

  /**
   * @type {HTMLElement} element
   * @private
   */
  this.element_ = element;

  /**
   * @type {function(number)}
   * @private
   */
  this.onPullReleased_ = onPullReleased;

  /**
   * @type {Array.<number>}
   * @private
   */
  this.pullStartPoint_ = null;

  /**
   * @type {Array.<number>}
   * @private
   */
  this.pullLastPoint_ = null;

  // End of properties, seal the object.
  Object.seal(this);

  // Register handlers for both touch and mouse.
  this.element_.addEventListener('touchstart', this.onTouchStart_.bind(this));
  window.addEventListener('touchmove', this.onTouchMove_.bind(this));
  window.addEventListener('touchend', this.onTouchEnd_.bind(this));

  this.element_.addEventListener('mousedown', this.onMouseDown_.bind(this));
  window.addEventListener('mousemove', this.onMouseMove_.bind(this), true);
  window.addEventListener('mouseup', this.onMouseUp_.bind(this));
};

/**
 * Handles start of pulling at passed coordinates.
 *
 * @param {number} x Horizontal coordinate in pixels.
 * @param {number} y Vertical coordinate in pixels.
 * @private
 */
camera.util.Puller.prototype.startPulling_ = function(x, y) {
  this.pullStartPoint_ = [x, y];
  this.pullLastPoint_ = [x, y];
  this.wrapper_.classList.remove('puller-reset');
};

/**
 * Handles update of pulling at passed coordinates.
 *
 * @param {number} x Horizontal coordinate in pixels.
 * @param {number} y Vertical coordinate in pixels.
 * @return {boolean} True if the event got handled, false otherwide.
 * @private
 */
camera.util.Puller.prototype.updatePulling_ = function(x, y) {
  if (!this.pullStartPoint_)
    return false;

  var distance = (y - this.pullStartPoint_[1]);
  this.wrapper_.style.webkitTransform = 'translateY(' + distance / 3 + 'px)';
  this.pullLastPoint_ = [x, y];
  return true;
};

/**
 * Handles end of pulling at passed coordinates.
 * @private
 */
camera.util.Puller.prototype.endPulling_ = function() {
  if (!this.pullStartPoint_)
    return;

  var distance = (this.pullLastPoint_[1] - this.pullStartPoint_[1]);
  this.onPullReleased_(distance);

  this.wrapper_.classList.add('puller-reset');
  this.wrapper_.style.webkitTransform = '';
  this.pullStartPoint_ = null;
  this.pullLastPoint_ = null;
};

/**
 * Handles the touch start event.
 * @param {Event} event Touch event.
 * @private
 */
camera.util.Puller.prototype.onTouchStart_ = function(event) {
  this.startPulling_(
      event.targetTouches[0].screenX, event.targetTouches[0].screenY);
};

/**
 * Handles the touch move event.
 * @param {Event} event Touch event.
 * @private
 */
camera.util.Puller.prototype.onTouchMove_ = function(event) {
  if (this.updatePulling_(
      event.targetTouches[0].screenX, event.targetTouches[0].screenY)) {
    event.preventDefault();  // Prevent native touch scrolling.
  }
};

/**
 * Handles the touch end event.
 * @param {Event} event Touch event.
 * @private
 */
camera.util.Puller.prototype.onTouchEnd_ = function(event) {
  this.endPulling_();
};

/**
 * Handles the mouse down event.
 * @param {Event} event Mount event.
 * @private
 */
camera.util.Puller.prototype.onMouseDown_ = function(event) {
  this.startPulling_(event.screenX, event.screenY);
};

/**
 * Handles the mouse move event.
 * @param {Event} event Mount event.
 * @private
 */
camera.util.Puller.prototype.onMouseMove_ = function(event) {
  this.updatePulling_(event.screenX, event.screenY);
};

/**
 * Handles the mouse up event.
 * @param {Event} event Mount event.
 * @private
 */
camera.util.Puller.prototype.onMouseUp_ = function(event) {
  this.endPulling_();
};

