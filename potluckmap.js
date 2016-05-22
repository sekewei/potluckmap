/* global $, L, console, document, JSONEditor */

// https://github.com/jdorn/json-editor
// https://github.com/leaflet-extras/leaflet-providers

// http://enable-cors.org/
// https://stackoverflow.com/questions/11281895/jquery-ajax-and-getjson-requests-hitting-access-control-allow-origin-issues

$(document).ready(init0);

function init0() {
    $.getJSON('config.json', init);
}

var G = {};

function init(config) {
    G.editor = new JSONEditor($('#config')[0], config);
    G.theMap = L.map('themap').setView([22.6217, 120.2842], 16);
    G.baseLayer = L.tileLayer.provider('OpenStreetMap.Mapnik').addTo(G.theMap);
    G.layerGroups = {};

    // https://github.com/leaflet/Leaflet.Toolbar/wiki/API-Reference
    G.toolbar = {};
    G.toolbar.reloadChanged = L.ToolbarAction.extend({
	options: {
	    toolbarIcon: {
		html: '&curvearrowright;',
		tooltip: 'reload changed'
	    }
	},
	addHooks: function () {
	    reload('changed');
	}
    });
    G.toolbar.reloadAll = L.ToolbarAction.extend({
	options: {
	    toolbarIcon: {
		html: '&circlearrowright;',
		tooltip: 'reload all'
	    }
	},
	addHooks: function () {
	    reload('all');
	}
    });
    G.toolbar._ = new L.Toolbar.Control({
	actions: [G.toolbar.reloadChanged, G.toolbar.reloadAll]
    }).addTo(G.theMap);

    setTitle();
    reload('all');
    G.editor.watch('root.title', setTitle);
    console.log(G);
}

function setTitle() {
    var title = G.editor.getEditor('root.title').getValue();
    $('title').html(title);
    $('h1').html(title);
}

function reload(which) {
    // $.getJSON('data/ex1.geojson', addLayerGroup);
    which = which || 'changed';
    var srcNew = {};
    G.editor.getEditor('root.sources').getValue().forEach(function (x) {
	srcNew[x.url] = x;
    });
    var oldURLs = Object.keys(G.layerGroups);
    var newURLs = Object.keys(srcNew);

    var toRemove, toAdd, toChange;
    if (which == 'changed') {
	toRemove = setOps.complement(oldURLs, newURLs);
	toAdd = setOps.complement(newURLs, oldURLs);
	toChange = setOps.intersection(oldURLs, newURLs).filter(function (x) {
	    return G.layerGroups[x].xtconfig.color != srcNew[x].color ||
		G.layerGroups[x].xtconfig.icon != srcNew[x].icon;
	});
    } else {
	toRemove = oldURLs;
	toAdd = newURLs;
	toChange = [];
    }
console.log('toRemove, toAdd, toChange:', toRemove, toAdd, toChange);
    toRemove.forEach(function (x) {
	G.theMap.removeLayer(G.layerGroups[x]);
	delete G.layerGroups[x];
	// G.theMap.removeLayer(G.layerGroups[sn.url]);
    });
    toAdd.forEach(function (x) {
	// https://stackoverflow.com/questions/26699377/how-to-add-additional-argument-to-getjson-callback-for-non-anonymous-function
        $.get(x, addLayerGroup.bind({ 'xtconfig': srcNew[x] }));
    });
    toChange.forEach(function (x) {
	G.layerGroups[x].xtconfig = srcNew[x];
	updateAllMarkers(G.layerGroups[x]);
    });
}

function addLayerGroup(data) {
    // http://leafletjs.com/examples/geojson.html
    var cfg = this.xtconfig;
    console.log('adding layer ' + cfg.url);
    var fmt = cfg.format;
    if (fmt == 'by-extension') {
	fmt = cfg.url.match(/\.(\w+)$/)[1];
    }
    LG =
	fmt == 'gpx' ? omnivore.gpx.parse(data) :
	fmt == 'csv' ? omnivore.csv.parse(data) :
	fmt == 'kml' ? omnivore.kml.parse(data) :
	null;
    if (fmt == 'geojson') {
	data = JSON.parse(data);
	LG = L.geoJson('features' in data ? data.features : data);
    } else if (fmt == 'osm json') {
	LG = L.geoJson(osmtogeojson(data));
    }
    if (! LG) {
	console.log('failed reading "' + cfg.url + '"');
	return;
    }
    // we don't need deep copy here, do we?
//    LG.xtconfig = JSON.parse(JSON.stringify(cfg));
    LG.xtconfig = cfg;
    LG.addTo(G.theMap);
    updateAllMarkers(LG);
    G.layerGroups[cfg.url] = LG;
    console.log('Done reading ' + LG.prettyPrint() +
	'. (Now we have ' + Object.keys(G.theMap._layers).length +
	' layers)'
    );
}

function updateAllMarkers(LG) {
    var marker = L.AwesomeMarkers.icon({
        'icon': LG.xtconfig.icon || 'bookmark',
        'markerColor': LG.xtconfig.color || 'green'
    });
    LG.getLayers().forEach(function (x) {
	x.setIcon(marker);
	x.tooltip = L.tooltip({
	    target: x,
	    map: G.theMap,
	    html: x.printTags(),
	    padding: '4px 8px'
	});
    });
}

// mostly for debugging, except 

L.Marker.prototype.printTags = function () {
    var p = this.feature.properties;
    if ('tags' in p) { p = p.tags; }
    var s = '';
    Object.keys(p).forEach(function (x) {
	if (x != 'desc' && p[x]) {
	    s += '<strong>' + x + '</strong>: ' + p[x] + '<br />';
	}
    });
    return s;
};

// add the prettyPrint() capability to several "Layer" classes
// goole "javascript prototype" for how to.
// also please 'grep L.Class.extend leaflet-src.js'
L.Marker.prototype.prettyPrint = function () {
    var p = this.feature.properties;
    // for markers created by osmtogeojson,
    // the name field is this.feature.properties.tags.name ;
    // for other markers, the name field is this.feature.properties.name .
    return 'M[' + ('name' in p ? p.name : 'tags' in p && 'name' in p.tags ? p.tags.name : '?') + ']';
};

L.TileLayer.prototype.prettyPrint = function () {
    return 'T[' + this._url + ']';
};

L.LayerGroup.prototype.prettyPrint = function () {
    var s = '';
    var subL = this._layers;
    Object.keys(subL).forEach(function (x) {
	s += subL[x].prettyPrint() + '、';
    } );
    return 'G[' + shortName(this.xtconfig.url) + '] contains ' + s;
};

/* skeleton of original, non-OOP version
function prettyPrint(layer) {
    if ('_url' in layer) {
	return layer.prettyPrint();
    } else if ('_latlng' in layer) {
	return layer.prettyPrint();
    } else if ('_layers' in layer) {
	return layer.prettyPrint();
    } else if ('_toolbar_type' in layer) {
	return 'Toolbar';
    } else {
	return '? unknown type of layer';
    }
}
*/

function shortName(url) {
    var m = url.match(/\/([^\/]*?)\.(\w+)$/);
    if (m) { return m[1]; }
    // https://stackoverflow.com/a/747845
    m = decodeURIComponent(url).match(/overpass.*?(\w+)\[(.*?)\]/);
    if (m) { return m[1] + '[' + m[2] + ']'; }
    return '?';
}

