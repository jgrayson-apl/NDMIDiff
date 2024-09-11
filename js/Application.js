/*
 Copyright 2022 Esri

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

const reactiveUtils = await $arcgis.import("esri/core/reactiveUtils");

import AppBase from "./support/AppBase.js";
import AppLoader from "./loaders/AppLoader.js";
import SignIn from './apl/SignIn.js';
import ViewLoading from './apl/ViewLoading.js';
import MapScale from './apl/MapScale.js';

import CompareView from './CompareView.js';
import ImageryDatesByLocation from './ImageryDatesByLocation.js';

class Application extends AppBase {

  /**
   * @type {Portal}
   */
  portal;

  /**
   *
   */
  constructor() {
    super();

    // LOAD APPLICATION BASE //
    super.load().then(() => {

      // APPLICATION LOADER //
      const applicationLoader = new AppLoader({app: this});
      applicationLoader.load().then(({portal, group, map, view}) => {
        //console.info(portal, group, map, view);

        // PORTAL //
        this.portal = portal;

        // SET APPLICATION DETAILS //
        this.setApplicationDetails({map, group});

        // STARTUP DIALOG //
        this.initializeStartupDialog();

        // VIEW SHAREABLE URL PARAMETERS //
        this.initializeViewShareable({view});

        // USER SIGN-IN //
        this.configUserSignIn();

        // APPLICATION //
        this.applicationReady({portal, group, map, view}).catch(this.displayError).then(() => {
          // HIDE APP LOADER //
          document.getElementById('app-loader').toggleAttribute('hidden', true);
          //console.info("Application ready...");
        });

      }).catch(this.displayError);
    }).catch(this.displayError);

  }

  /**
   *
   */
  configUserSignIn() {

    const signInContainer = document.getElementById('sign-in-container');
    if (signInContainer) {
      const signIn = new SignIn({container: signInContainer, portal: this.portal});
    }

  }

  /**
   *
   * @param view
   */
  configView({view}) {
    return new Promise(async (resolve, reject) => {
      if (view) {

        // VIEW AND POPUP //
        const Popup = await $arcgis.import("esri/widgets/Popup");
        view.set({
          constraints: {snapToZoom: false},
          popup: new Popup({
            dockEnabled: true,
            dockOptions: {
              buttonEnabled: false,
              breakpoint: false,
              position: "top-right"
            }
          })
        });

        // HOME //
        const Home = await $arcgis.import("esri/widgets/Home");
        const home = new Home({view});
        view.ui.add(home, {position: 'top-left', index: 0});

        // SEARCH //
        const Search = await $arcgis.import("esri/widgets/Search");
        const search = new Search({view: view});
        view.ui.add(search, {position: 'top-left', index: 0});

        // COMPASS //
        const Compass = await $arcgis.import("esri/widgets/Compass");
        const compass = new Compass({view: view});
        view.ui.add(compass, {position: 'top-left', index: 2});
        reactiveUtils.watch(() => view.rotation, rotation => {
          compass.set({visible: (rotation > 0)});
        }, {initial: true});

        // MAP SCALE //
        const mapScale = new MapScale({view});
        view.ui.add(mapScale, {position: 'bottom-left', index: 0});

        // VIEW LOADING INDICATOR //
        const viewLoading = new ViewLoading({view: view});
        view.ui.add(viewLoading, 'bottom-right');

        // LAYER LIST //
        const LayerList = await $arcgis.import("esri/widgets/LayerList");
        const layerList = new LayerList({
          container: 'layers-container',
          view: view,
          visibleElements: {
            errors: true,
            statusIndicators: true
          }
        });

        // LEGEND //
        const Legend = await $arcgis.import("esri/widgets/Legend");
        const legend = new Legend({container: 'legend-container', view: view});
        //view.ui.add(legend, {position: 'bottom-left', index: 0});

        // BOOKMARKS //
        // const Bookmarks = await $arcgis.import("esri/widgets/Bookmarks");
        // const bookmarks = new Bookmarks({container: 'places-container', view: view});
        // const Expand = await $arcgis.import("esri/widgets/Expand");
        // const bookmarksExpand = new Expand({view: view,content:bookmarks,expanded:true});
        //view.ui.add(bookmarksExpand, {position: 'top-left', index: 0});

        resolve();

      } else { resolve(); }
    });
  }

  /**
   *
   * @param portal
   * @param group
   * @param map
   * @param view
   * @returns {Promise}
   */
  applicationReady({portal, group, map, view}) {
    return new Promise(async (resolve, reject) => {
      // VIEW READY //
      this.configView({view}).then(async () => {

        await this.initializeNDMIViews({view});

        resolve();
      }).catch(reject);
    });
  }

  /**
   *
   * https://developers.arcgis.com/javascript/latest/api-reference/esri-layers-support-rasterFunctionUtils.html
   *
   * @param view
   */
  async initializeNDMIViews({view}) {

    const beforeCompareView = new CompareView({
      container: 'before-compare-panel',
      sourceView: view,
      compareStatus: CompareView.COMPARE_STATUS.BEFORE
    });

    const afterCompareView = new CompareView({
      container: 'after-compare-panel',
      sourceView: view,
      compareStatus: CompareView.COMPARE_STATUS.AFTER
    });

    const analysisLayer = CompareView.CREATE_IMAGERY_LAYER({opacity: 0.5});
    await analysisLayer.load();
    //console.table(analysisLayer.serviceRasterInfo.bandInfos.map(bi => bi.toJSON()));
    view.map.add(analysisLayer);

    const differenceTypeOption = document.getElementById('difference-type-option');
    differenceTypeOption.addEventListener('calciteSegmentedControlChange', () => {
      calculateNDMIDifference();
    });

    const rasterFunctionUtils = await $arcgis.import("esri/layers/support/rasterFunctionUtils");
    const compareRasters = {before: null, after: null};
    const fudgeFactor = 0.00000001;


    /**
     *
     * Landsat 8-9: https://www.arcgis.com/home/item.html?id=4ca13f0e4e29403fa68c46d188c4be73
     *
     * https://developers.arcgis.com/javascript/latest/api-reference/esri-layers-support-rasterFunctionUtils.html#bandArithmeticNDMI
     *
     */
    const calculateNDMIDifference = () => {

      if (compareRasters.before && compareRasters.after) {

        const beforeNDMI = rasterFunctionUtils.bandArithmeticNDMI({
          ...CompareView.DEFAULT_NDMI_BANDS,
          raster: compareRasters.before
        });
        const afterNDMI = rasterFunctionUtils.bandArithmeticNDMI({
          ...CompareView.DEFAULT_NDMI_BANDS,
          raster: compareRasters.after
        });

        this.relativeDifferenceRF = rasterFunctionUtils.minus({
          raster: beforeNDMI,
          raster2: afterNDMI,
          outputPixelType: 'f32'
        });

        this.absoluteDifferenceRF = rasterFunctionUtils.remap({
          raster: this.relativeDifferenceRF,
          rangeMaps: [
            {range: [-2.0, -fudgeFactor], output: 1},
            {range: [-fudgeFactor, fudgeFactor], output: 2},
            {range: [fudgeFactor, 2.0], output: 3}
          ],
          outputPixelType: 'u8'
        });

        if (differenceTypeOption.value === 'relative') {

          analysisLayer.set({
            rasterFunction: this.relativeDifferenceRF,
            renderer:
              {
                type: "raster-stretch",
                stretchType: 'standard-deviation',
                numberOfStandardDeviations: 1.0,
                dynamicRangeAdjustment: true,
                statistics: [],
                outputMin: 0,
                outputMax: 255,
                colorRamp: {
                  type: "algorithmic",
                  fromColor: [255, 0, 0],
                  toColor: [0, 255, 0]
                }
              }
          });

        } else {

          analysisLayer.set({
            rasterFunction: this.absoluteDifferenceRF,
            renderer: {
              type: "unique-value",
              field: "value",
              uniqueValueInfos: [
                {value: 1, label: 'loss', symbol: {type: 'simple-fill', color: [255, 0, 0]}},
                {value: 2, label: 'no change', symbol: {type: 'simple-fill', color: [128, 128, 128]}},
                {value: 3, label: 'gain', symbol: {type: 'simple-fill', color: [0, 255, 0]}}
              ]
            }
          });

        }
      }
    };

    beforeCompareView.addEventListener('date-change', ({detail: {rasterID}}) => {
      compareRasters.before = `$${ rasterID }`;
      calculateNDMIDifference();
      getDifference();
    });
    afterCompareView.addEventListener('date-change', ({detail: {rasterID}}) => {
      compareRasters.after = `$${ rasterID }`;
      calculateNDMIDifference();
      getDifference();
    });

    await Promise.all([beforeCompareView.load(), afterCompareView.load()]);

    reactiveUtils.watch(() => view.viewpoint, viewpoint => {
      beforeCompareView.viewpoint = viewpoint;
      afterCompareView.viewpoint = viewpoint;
    });

    const imageryDatesByLocation = new ImageryDatesByLocation({imageryLayer: analysisLayer, view: view});
    imageryDatesByLocation.addEventListener('dates-change', ({detail: {availableImageryDates}}) => {
      beforeCompareView.availableImageryDates = availableImageryDates;
      afterCompareView.availableImageryDates = availableImageryDates;
    });

    const createTextSymbol = text => {
      return {
        type: 'text',
        color: "#fefefe",
        haloColor: "#009AF2",
        haloSize: "2px",
        text: text,
        font: {size: 32}
      };
    };

    const Graphic = await $arcgis.import("esri/Graphic");
    const identifyGraphic = new Graphic({
      symbol: createTextSymbol("result")
    });

    const GraphicsLayer = await $arcgis.import("esri/layers/GraphicsLayer");
    const identifyLayer = new GraphicsLayer({
      title: 'Identify Results',
      graphics: [identifyGraphic]
    });
    view.map.add(identifyLayer);

    let _location;
    const getDifference = async (location) => {
      _location = location || _location;
      if (_location) {

        const identifyResult = await analysisLayer.identify({
          geometry: _location,
          pixelSize: analysisLayer.rasterInfo.pixelSize,
          rasterFunction: this.relativeDifferenceRF,
          returnGeometry: false,
          returnCatalogItems: false,
          returnPixelValues: true,
          processAsMultidimensional: false
        });

        const diff = Number(identifyResult.value);

        identifyGraphic.set({
          geometry: _location,
          symbol: createTextSymbol(diff)
        });
      }
    };

    reactiveUtils.on(() => view, 'click', evt => {
      evt.stopPropagation();
      getDifference(evt.mapPoint);
    });

  }

}

export default new Application();

