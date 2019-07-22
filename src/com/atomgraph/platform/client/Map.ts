/// <reference types="googlemaps" />

// import { Map, LatLng, LatLngBounds, Marker, InfoWindow } from 'googlemaps'; // using <reference> instead as otherwise we would get the "@types/googlemaps/index.d.ts is not a module" error
import { MapOverlay } from './map/MapOverlay';
import { SelectBuilder } from '@atomgraph/SPARQLBuilder/com/atomgraph/platform/query/SelectBuilder';
import { DescribeBuilder } from '@atomgraph/SPARQLBuilder/com/atomgraph/platform/query/DescribeBuilder';
import { FilterPattern, OperationExpression, SelectQuery } from 'sparqljs';
import { URLBuilder } from '@atomgraph/URLBuilder/com/atomgraph/platform/util/URLBuilder';

export class Geo
{

    public static readonly RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
    public static readonly XSD_NS = "http://www.w3.org/2001/XMLSchema#";
    public static readonly APLT_NS = "http://atomgraph.com/ns/platform/templates#";
    public static readonly GEO_NS = "http://www.w3.org/2003/01/geo/wgs84_pos#"

    private readonly map: google.maps.Map;
    private readonly endpoint: URL;
    private readonly selectBuilder: SelectBuilder;
    private readonly itemVarName: string;
    private readonly loadedResources: Map<URL, boolean>;
    private loadedBounds: google.maps.LatLngBounds | null | undefined;
    private readonly icons: string[];
    private readonly typeIcons: Map<string, string>;

    constructor(map: google.maps.Map, endpoint: URL, selectBuilder: SelectBuilder, itemVarName: string)
    {
        this.map = map;
        this.endpoint = endpoint;
        this.selectBuilder = selectBuilder;
        this.itemVarName = itemVarName;
        this.loadedResources = new Map<URL, boolean>();
        this.icons = [ "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
            "https://maps.google.com/mapfiles/ms/icons/purple-dot.png",
            "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
            "https://maps.google.com/mapfiles/ms/icons/green-dot.png" ];
        this.typeIcons = new Map<string, string>();
    };

    private getMap(): google.maps.Map
    {
        return this.map;
    };

    private getEndpoint(): URL
    {
        return this.endpoint;
    };

    private getSelectBuilder(): SelectBuilder
    {
        return this.selectBuilder;
    };

    private getItemVarName(): string
    {
        return this.itemVarName;
    };

    private getLoadedResources(): Map<URL, boolean>
    {
        return this.loadedResources;
    };

    public getLoadedBounds(): google.maps.LatLngBounds | null | undefined
    {
        return this.loadedBounds;
    };

    private setLoadedBounds(bounds?: google.maps.LatLngBounds | null | undefined)
    {
        this.loadedBounds = bounds;
    };

    public getIcons(): string[]
    {
        return this.icons;
    };

    public getTypeIcons(): Map<string, string>
    {
        return this.typeIcons;
    };

    private buildQuery(east: number, north: number, south: number, west: number): DescribeBuilder
    {
        return <DescribeBuilder>DescribeBuilder.new().
            where(DescribeBuilder.group([
                <SelectQuery>this.getSelectBuilder().
                    bgpTriple({ subject: SelectBuilder.var(this.getItemVarName()), predicate: SelectBuilder.uri(Geo.GEO_NS + "lat"), object: SelectBuilder.var("lat") }).
                    bgpTriple({ subject: SelectBuilder.var(this.getItemVarName()), predicate: SelectBuilder.uri(Geo.GEO_NS + "long"), object: SelectBuilder.var("long") }).
                    where(SelectBuilder.filter(SelectBuilder.operation("<", [ SelectBuilder.var("long"), SelectBuilder.typedLiteral(east.toString(), Geo.XSD_NS + "decimal") ]))).
                    where(SelectBuilder.filter(SelectBuilder.operation("<", [ SelectBuilder.var("lat"), SelectBuilder.typedLiteral(north.toString(), Geo.XSD_NS + "decimal") ]))).
                    where(SelectBuilder.filter(SelectBuilder.operation(">", [ SelectBuilder.var("lat"), SelectBuilder.typedLiteral(south.toString(), Geo.XSD_NS + "decimal") ]))).
                    where(SelectBuilder.filter(SelectBuilder.operation(">", [ SelectBuilder.var("long"), SelectBuilder.typedLiteral(west.toString(), Geo.XSD_NS + "decimal") ]))).
                    build()
                ]));
    };

    private loadMarkers(promise: (rdfXml: Document) => (void)): void
    {
        if (this.getMap().getBounds() == null) throw Error("Map bounds are null or undefined");

        // do not load markers if the new bounds are within already loaded bounds
        if (this.getLoadedBounds() != null &&
                this.getLoadedBounds()!.contains(this.getMap().getBounds()!.getNorthEast()) && 
                this.getLoadedBounds()!.contains(this.getMap().getBounds()!.getSouthWest()))
            return;
        
        let markerOverlay = new MapOverlay(this.getMap(), "marker-progress");
        markerOverlay.show();

        let query = this.buildQuery(this.getMap().getBounds()!.getNorthEast().lng(),
            this.getMap().getBounds()!.getNorthEast().lat(),
            this.getMap().getBounds()!.getSouthWest().lat(),
            this.getMap().getBounds()!.getSouthWest().lng()).
            toString();

        let url = URLBuilder.fromURL(this.getEndpoint()).
            searchParam("query", query).
            build();

        let req = new Request(url.toString(), { "headers": { "Accept": "application/rdf+xml" } } );
        fetch(req).then(response =>
            {
                if(response.ok) return response.text();
                throw new Error("Could not load RDF/XML response from '" + response.url + "'");
            }).
            then(str => (new DOMParser()).parseFromString(str, "text/xml")).
            then(promise).
            then(() =>
            {
                this.setLoadedBounds(this.getMap().getBounds());
                markerOverlay.hide();
            }).
            catch(error =>
            {
                console.log('There has been a problem with your fetch operation: ', error.message);
            });
    };

    public addMarkers(rdfXml: XMLDocument): void
    {   
        let descriptions = rdfXml.getElementsByTagNameNS(Geo.RDF_NS, "Description");
        for (let description of <any>descriptions)
        {
            if (description.hasAttributeNS(Geo.RDF_NS, "about") || description.hasAttributeNS(Geo.RDF_NS, "nodeID"))
            {
                let uri = description.getAttributeNS(Geo.RDF_NS, "about");
                let bnode = description.getAttributeNS(Geo.RDF_NS, "nodeID");
                let key = null;
                if (bnode !== null) key = rdfXml.documentURI + "#" + bnode;
                else key = uri;
                
                if (!this.getLoadedResources().has(key))
                {
                    let latElems = description.getElementsByTagNameNS(Geo.GEO_NS, "lat");
                    let longElems = description.getElementsByTagNameNS(Geo.GEO_NS, "long");
                    let titleElems = description.getElementsByTagNameNS("http://purl.org/dc/terms/", "title");
                    
                    if (latElems.length > 0 && longElems.length > 0 && titleElems.length > 0)
                    {
                        this.getLoadedResources().set(key, true); // mark resource as loaded

                        let icon = null;
                        let type = null;
                        let typeElems = description.getElementsByTagNameNS(Geo.RDF_NS, "type");
                        if (typeElems.length > 0)
                        {
                            type = typeElems[0].getAttributeNS(Geo.RDF_NS, "resource");
                            if (!this.getTypeIcons().has(type))
                            {
                                // icons get recycled when # of different types in response > # of icons
                                let iconIndex = this.getTypeIcons().size % this.getIcons().length;
                                icon = this.getIcons()[iconIndex];
                                this.getTypeIcons().set(type, icon);
                            }
                            else icon = this.getTypeIcons().get(type);
                        }

                        let latLng = new google.maps.LatLng(latElems[0].textContent, longElems[0].textContent);
                        let markerConfig = <google.maps.ReadonlyMarkerOptions>{
                            "position": latLng,
                            // "label": label,
                            "map": this.getMap(),
                            "title": titleElems[0].textContent
                        } ;
                        let marker = new google.maps.Marker(markerConfig);
                        if (icon != null) marker.setIcon(icon);
                        
                        //console.log("Marker URI: " + uri);
                        // popout InfoWindow for the topic of current document (same as on click)
                        let docs = description.getElementsByTagNameNS("http://xmlns.com/foaf/0.1/", "isPrimaryTopicOf");
                        //console.log("Docs: " + docs[0]);
                        if (docs.length > 0 && docs[0].hasAttributeNS(Geo.RDF_NS, "resource"))
                        {
                            let infoWindowOverlay = new MapOverlay(this.getMap(), "infowindow-progress");
                            
                            let docUri = docs[0].getAttributeNS(Geo.RDF_NS, "resource");
                            this.bindMarkerClick(marker, docUri, infoWindowOverlay); // bind openInfoWindow() to marker onclick
                            
                            //if (docUri === this.getMap().getDiv().ownerDocument.documentURI) this.openInfoWindow(marker, docUri, infoWindowOverlay);
                        }
                    }
                }
            }
        }
    };

    private bindMarkerClick(marker: google.maps.Marker, uri: string, overlay: MapOverlay): void
    {
        marker.addListener("click", (marker: google.maps.Marker, uri: string, overlay: MapOverlay) => this.openInfoWindow(marker, uri, overlay));
    };

    private openInfoWindow(marker: google.maps.Marker, uri: string, overlay: MapOverlay): void
    {
        overlay.show();
        
        let url = URLBuilder.fromString(uri).
            searchParam("mode", Geo.APLT_NS + "InfoWindowMode").
            hash(null).
            build();

        let req = new Request(url.toString(), { "headers": { "Accept": "application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } } );
        fetch(req).then(response =>
            {
                if(response.ok) return response.text();
                throw new Error("Could not load RDF/XML response from '" + response.url + "'");
            }).
            then(str => (new DOMParser()).parseFromString(str, "text/xml")). // could be "text/html" with a different Accept header
            then(html =>
            {
                // render first child of <body> as InfoWindow content
                let infoContent = html.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "body")[0].children[0];
                //console.log(infoContent);
                let infoWindow = new google.maps.InfoWindow({ "content" : infoContent });
                overlay.hide();
                infoWindow.open(this.getMap(), marker);
            }).
            catch(error =>
            {
                console.log('There has been a problem with your fetch operation: ', error.message);
            });
    };

}