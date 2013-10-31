// Copyright (c) 2013 The Chromium OS Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

/**
 * Namespace for the Camera app.
 */
var camera = camera || {};

/**
 * Namespace for views.
 */
camera.views = camera.views || {};

/**
 * Creates the Gallery Base view controller.
 *
 * @param {camera.View.Context} context Context object.
 * @param {camera.Router} router View router to switch views.
 * @extends {camera.View}
 * @implements {camera.models.Gallery.Observer}
 * @constructor
 */
camera.views.GalleryBase = function(context, router) {
  camera.View.call(this, context, router);

  /**
   * @type {camera.models.Gallery}
   * @protected
   */
  this.model = null;

  /**
   * Contains pictures' views.
   * @type {Array.<camera.views.GalleryBase.DOMPicture>}
   * @protected
   */
  this.pictures = [];
};

/**
 * Represents a picture attached to the DOM by combining the picture data
 * object with the DOM element.
 *
 * @param {camera.models.Gallery.Picture} picture Picture data.
 * @param {HTMLImageElement} element DOM element holding the picture.
 * @constructor
 */
camera.views.GalleryBase.DOMPicture = function(picture, element) {
  /**
   * @type {camera.models.Gallery.Picture}
   * @private
   */
  this.picture_ = picture;

  /**
   * @type {HTMLElement}
   * @private
   */
  this.element_ = element;

  /**
   * @type {camera.views.GalleryBase.DOMPicture.DisplayResolution}
   * @private
   */
  this.displayResolution_ =
      camera.views.GalleryBase.DOMPicture.DisplayResolution.LOW;

  // End of properties. Seal the object.
  Object.seal(this);

  // Load the image.
  this.updateImage_();
};

/**
 * Sets resolution of the picture to be displayed.
 * @enum {number}
 */
camera.views.GalleryBase.DOMPicture.DisplayResolution = {
  LOW: 0,
  HIGH: 1
};

camera.views.GalleryBase.DOMPicture.prototype = {
  get picture() {
    return this.picture_;
  },
  get element() {
    return this.element_;
  },
  set displayResolution(value) {
    if (this.displayResolution_ == value)
      return;
    this.displayResolution_ = value;
    this.updateImage_();
  },
  get displayResolution() {
    return this.displayResolution_;
  }
};

/**
 * Loads the picture into the DOM element.
 * @private
 */
camera.views.GalleryBase.DOMPicture.prototype.updateImage_ = function() {
  switch (this.displayResolution_) {
    case camera.views.GalleryBase.DOMPicture.DisplayResolution.LOW:
      this.element_.src = this.picture_.thumbnailURL;
      break;
    case camera.views.GalleryBase.DOMPicture.DisplayResolution.HIGH:
      this.element_.src = this.picture_.imageURL;
      break;
  }
};

camera.views.GalleryBase.prototype = {
  __proto__: camera.View.prototype
};

/**
 * @override
 */
camera.views.GalleryBase.prototype.initialize = function(callback) {
  camera.models.Gallery.getInstance(function(model) {
    this.model = model;
    this.model.addObserver(this);
    this.renderPictures_();
    callback();
  }.bind(this), function() {
    // TODO(mtomasz): Add error handling.
    console.error('Unable to initialize the file system.');
    callback();
  });
};

/**
 * Renders pictures from the model onto the DOM.
 * @private
 */
camera.views.GalleryBase.prototype.renderPictures_ = function() {
  for (var index = 0; index < this.model.length; index++) {
    this.addPictureToDOM(this.model.pictures[index]);
  }
};

/**
 * Deletes the currently selected picture. If nothing selected, then nothing
 * happens.
 * @protected
 */
camera.views.GalleryBase.prototype.deleteSelection = function() {
  if (!this.currentPicture())
    return;

  this.router.navigate(camera.Router.ViewIdentifier.DIALOG, {
    type: camera.views.Dialog.Type.CONFIRMATION,
    message: chrome.i18n.getMessage('deleteConfirmationMsg')
  }, function(result) {
    if (!result.isPositive)
      return;
    this.model.deletePicture(this.currentPicture().picture,
        function() {},
        function() {
          // TODO(mtomasz): Handle errors.
        });
  }.bind(this));
};

/**
 * Returns the currently selected picture view.
 * @return {camera.views.GalleryBase.DOMPicture}
 * @protected
 */
camera.views.GalleryBase.prototype.currentPicture = function() {
  if (this.model.currentIndex === null)
    return null;

  return this.pictures[this.model.currentIndex];
};

/**
 * @override
 */
camera.views.GalleryBase.prototype.onCurrentIndexChanged = function(
    oldIndex, newIndex) {
  if (oldIndex !== null && oldIndex < this.model.length)
    this.pictures[oldIndex].element.classList.remove('selected');
  if (newIndex !== null && newIndex < this.model.length)
    this.pictures[newIndex].element.classList.add('selected');
};

/**
 * @override
 */
camera.views.GalleryBase.prototype.onPictureDeleting = function(index) {
  this.pictures[index].element.parentNode.removeChild(
    this.pictures[index].element);
  this.pictures.splice(index, 1);
};

/**
 * @override
 */
camera.views.GalleryBase.prototype.onKeyPressed = function(event) {
  var currentPicture = this.currentPicture();
  switch (camera.util.getShortcutIdentifier(event)) {
    case 'Right':
      if (this.model.length) {
        if (!currentPicture)
          this.model.currentIndex = this.model.length - 1;
        else
          this.model.currentIndex = Math.max(0, this.model.currentIndex - 1);
      }
      break;
    case 'Left':
      if (this.model.length) {
        if (!currentPicture) {
          this.model.currentIndex = 0;
        } else {
          this.model.currentIndex =
              Math.min(this.model.length - 1, this.model.currentIndex + 1);
        }
      }
      break;
     case 'End':
      if (this.model.length)
        this.model.currentIndex = 0;
      break;
    case 'Home':
      if (this.model.length)
        this.model.currentIndex = this.model.length - 1;
      break;
    case 'U+007F':  // Delete.
      event.preventDefault();
      this.deleteSelection();
      break;
    case 'U+001B':  // Escape.
      event.preventDefault();
      this.router.back();
      break;
  }
};

/**
 * @override
 */
camera.views.GalleryBase.prototype.onPictureAdded = function(index) {
  this.addPictureToDOM(this.model.pictures[index]);
};

/**
 * Adds the picture to DOM. Should be overriden by inheriting classes.
 * @param {camera.models.Gallery.Picture} picture Model of the picture to be
 *     added.
 * @protected
 */
camera.views.GalleryBase.prototype.addPictureToDOM = function(picture) {
  throw new Error('Not implemented.');
}
