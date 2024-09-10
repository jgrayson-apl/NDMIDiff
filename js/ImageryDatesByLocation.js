/*
 Copyright 2023 Esri

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */
/**
 *
 * ImageryDatesByLocation
 *  - Imagery Dates By Location
 *
 * Author:   John Grayson - Applications Prototype Lab - Esri
 * Created:  9/10/2024 - 0.0.1 -
 * Modified:
 *
 */

const promiseUtils = await $arcgis.import("esri/core/promiseUtils");
const reactiveUtils = await $arcgis.import("esri/core/reactiveUtils");

class ImageryDatesByLocation extends EventTarget {

  static version = '0.0.1';

  /**
   * @type {MapView}
   */
  view;

  /**
   * @type {ImageryLayer}
   */
  imageryLayer;

  /**
   *
   * @param {MapView} view
   * @param {ImageryLayer} imageryLayer
   */
  constructor({view, imageryLayer}) {
    super();

    this.view = view;
    this.imageryLayer = imageryLayer;

    const {objectIdField, timeInfo: {startField, fullTimeExtent}} = imageryLayer;
    this.objectIdField = objectIdField;
    this.fullTimeExtent = fullTimeExtent;
    this.dateField = startField;

    this.initializeDatesUpdates();
  }

  /**
   *
   * @param error
   * @return {false|void}
   */
  handleAbort = error => !promiseUtils.isAbortError(error) && console.error(error);

  /**
   *
   */
  initializeDatesUpdates() {

    const getCurrentDates = promiseUtils.debounce(async ({extent}) => {
      const availableImageryDates = await this._getCurrentDates({extent});
      this.dispatchEvent(new CustomEvent('dates-change', {detail: {availableImageryDates}}));
    });

    reactiveUtils.when(() => this.view.stationary, () => {
      getCurrentDates({extent: this.view.extent}).catch(this.handleAbort);
    }, {initial: true});

  }

  /**
   *
   * @param extent
   * @return {Promise<{rasterID:string,rasterDate:Date}[]>}
   * @private
   */
  async _getCurrentDates({extent}) {

    const datesQuery = this.imageryLayer.createQuery();
    datesQuery.set({
      geometry: extent,
      timeExtent: this.fullTimeExtent,
      outFields: ['OBJECTID', 'AcquisitionDate', 'CloudCover', 'Best', 'Name', 'Category', 'ProductName'],
      orderByFields: ['AcquisitionDate DESC']
    });

    return this.imageryLayer.queryRasters(datesQuery).then(({features}) => {
      return features.map(({attributes}) => {
        const rasterID = String(attributes[this.objectIdField]);
        const rasterDate = new Date(attributes[this.dateField]);
        return {rasterID, rasterDate};
      });
    });

  }

}

export default ImageryDatesByLocation;
