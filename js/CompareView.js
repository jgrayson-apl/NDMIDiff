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
 * CompareView
 *  - Element: apl-compare-view
 *  - Description: Comparison View
 *
 * Author:   John Grayson - Applications Prototype Lab - Esri
 * Created:  9/9/2024 - 0.0.1 -
 * Modified:
 *
 * Landsat 8-9: https://www.arcgis.com/home/item.html?id=4ca13f0e4e29403fa68c46d188c4be73
 *
 */

const promiseUtils = await $arcgis.import("esri/core/promiseUtils");
const ImageryLayer = await $arcgis.import("esri/layers/ImageryLayer");

class CompareView extends HTMLElement {

  static version = '0.0.1';

  /**
   * @typedef {number} STATUS
   **/

  /**
   * @enum {STATUS}
   */
  static COMPARE_STATUS = {BEFORE: 1, AFTER: 2};

  /**
   *
   * Landsat 8-9: https://www.arcgis.com/home/item.html?id=4ca13f0e4e29403fa68c46d188c4be73
   *
   * @type {string}
   */
  static IMAGERY_PORTAL_ITEM_ID = "4ca13f0e4e29403fa68c46d188c4be73";

  /**
   *
   * @type {string}
   */
  static DEFAULT_IMAGERY_FILTER = "(Category = 1) AND ((CloudCover >= 0.00) AND (CloudCover <= 0.05))";

  /**
   *
   * @type {string}
   */
  static DEFAULT_NDMI_RASTER_FUNCTION_NAME = 'Normalized Difference Moisture Index Colorized';

  /**
   *
   * CAUTION: 0 BASED INDEX USED IN UTILS...
   *
   * @type {{nirBandId: number, swirBandId: number}}
   */
  static DEFAULT_NDMI_BANDS = {nirBandId: 4, swirBandId: 5};

  /**
   * @type {HTMLElement}
   */
  container;

  /**
   * @type {boolean}
   */
  #loaded = false;
  get loaded() {
    return this.#loaded;
  }

  set loaded(value) {
    this.#loaded = value;
    this.dispatchEvent(new CustomEvent('loaded', {detail: {}}));
  }

  /**
   * @type {MapView}
   */
  sourceView;

  /**
   * @type {MapView}
   */
  mapView;

  /**
   * @type {Viewpoint}
   */
  #viewpoint;

  /**
   *
   * @param {Viewpoint} value
   */
  set viewpoint(value) {
    this.#viewpoint = value;
    this.loaded && (this.mapView.viewpoint = this.#viewpoint);
  }

  /**
   * @type {ImageryLayer}
   */
  imageryLayer;

  /**
   *
   * @type {string}
   */
  objectIdField;

  /**
   * @type {STATUS}
   */
  compareStatus;

  /**
   * @typedef {rasterID:string,rasterDate:Date} RasterDateInfo
   */

  /**
   * @type {RasterDateInfo[]}
   */
  #availableImageryDates;

  /**
   *
   * @param {RasterDateInfo[]} value
   */
  set availableImageryDates(value) {
    this.#availableImageryDates = value;
    this._updateDateSelect();
  }

  /**
   *
   * @param {HTMLElement|string|null} [container]
   * @param {MapView} sourceView
   * @param {string} defaultRasterFunctionName
   * @param {STATUS} compareStatus
   */
  constructor({container = null, sourceView, compareStatus} = {}) {
    super();

    this.container = (container instanceof HTMLElement) ? container : document.getElementById(container);

    this.sourceView = sourceView;
    this.compareStatus = compareStatus;

    this.dateFormatter = new Intl.DateTimeFormat('default', {timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric'});

    const shadowRoot = this.attachShadow({mode: 'open'});
    shadowRoot.innerHTML = `
      <style>
        :host {
          height: 100%;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;          
        }
        :host .view-container {
          pointer-events: none;
          margin: 8px;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          border: solid 1px var(--calcite-color-brand);
        }
        :host .current-date-select {
          width: 100%;        
        }
        :host calcite-option option {
          text-align: right;        
        }
      </style>
      <calcite-label layout="inline" style="margin:8px 8px 0 8px;--calcite-label-margin-bottom:0;">        
        <div>Date:</div>
        <calcite-select class="current-date-select"></calcite-select>        
      </calcite-label>
      <div class="view-container"></div>     
    `;

    this.container?.append(this);
  }

  /**
   *
   */
  connectedCallback() {

    this.currentDateSelect = this.shadowRoot.querySelector('.current-date-select');
    this.viewContainer = this.shadowRoot.querySelector('.view-container');

    // LOADED //
    requestAnimationFrame(async () => {

      this.imageryLayer = await this.initializeImageryLayer()
      this.mapView = await this.initializeMapView();

      await this.initialiseDateSelect();

      this.loaded = true;
    });
  }

  /**
   *
   * @returns {Promise<>}
   */
  load() {
    return new Promise((resolve, reject) => {
      if (this.loaded) { resolve(); } else {
        this.addEventListener('loaded', () => { resolve(); }, {once: true});
      }
    });
  }

  /**
   *
   * @param {{}} layerParams
   * @return {ImageryLayer}
   * @constructor
   */
  static CREATE_IMAGERY_LAYER(layerParams) {
    return new ImageryLayer({
      portalItem: {id: CompareView.IMAGERY_PORTAL_ITEM_ID},
      rasterFunction: {functionName: CompareView.DEFAULT_NDMI_RASTER_FUNCTION_NAME},
      definitionExpression: CompareView.DEFAULT_IMAGERY_FILTER,
      ...layerParams
    });
  }

  /**
   *
   * @return {Promise<ImageryLayer>}
   */
  async initializeImageryLayer() {

    const imageryLayer = CompareView.CREATE_IMAGERY_LAYER({});
    await imageryLayer.load();

    return imageryLayer;
  }

  /**
   *
   * @return {Promise<MapView>}
   */
  async initializeMapView() {

    const MapView = await $arcgis.import("esri/views/MapView");
    const mapView = new MapView({
      container: this.viewContainer,
      ui: {components: []},
      map: {
        //basemap: 'satellite',
        layers: [this.imageryLayer]
      },
      viewpoint: this.sourceView.viewpoint.clone()
    });

    await mapView.when();

    return mapView;
  }

  /**
   *
   * @return {Promise<void>}
   */
  async initialiseDateSelect() {

    this._updateDateSelect = promiseUtils.debounce(() => {

      const previousSelectedValue = this.currentDateSelect.value;

      const dateOptions = this.#availableImageryDates.map((dateInfo) => {
        const {rasterID, rasterDate} = dateInfo;

        const dateOption = document.createElement("calcite-option");
        dateOption.innerHTML = this.dateFormatter.format(rasterDate);
        dateOption.setAttribute("value", rasterID);
        dateOption.toggleAttribute("selected", (rasterID === previousSelectedValue));

        return dateOption;
      });
      this.currentDateSelect.replaceChildren(...dateOptions);

      switch (this.compareStatus) {
        case CompareView.COMPARE_STATUS.BEFORE:
          this.currentDateSelect.value = previousSelectedValue || dateOptions.at(0).value;
          break;
        case CompareView.COMPARE_STATUS.AFTER:
          this.currentDateSelect.value = previousSelectedValue || dateOptions.at(-1).value;
          break;
      }

      requestAnimationFrame(() => {
        _selectedDateChange(this.currentDateSelect.value);
      });
    });

    const _selectedDateChange = (rasterID) => {

      this.imageryLayer.mosaicRule = {
        method: "lock-raster",
        operation: "first",
        lockRasterIds: [rasterID]
      };

      this.dispatchEvent(new CustomEvent('date-change', {detail: {rasterID}}));
    };

    this.currentDateSelect.addEventListener("calciteSelectChange", () => {
      _selectedDateChange(this.currentDateSelect.value);
    });

  }

}

customElements.define("apl-compare-view", CompareView);

export default CompareView;
