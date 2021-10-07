import { MapOverlay } from './map/MapOverlay';
import { SelectBuilder } from '@atomgraph/SPARQLBuilder/com/atomgraph/linkeddatahub/query/SelectBuilder';
import { DescribeBuilder } from '@atomgraph/SPARQLBuilder/com/atomgraph/linkeddatahub/query/DescribeBuilder';
import { QueryBuilder } from '@atomgraph/SPARQLBuilder/com/atomgraph/linkeddatahub/query/QueryBuilder';
import { SelectQuery } from 'sparqljs';
import { URLBuilder } from '@atomgraph/URLBuilder/com/atomgraph/linkeddatahub/util/URLBuilder';

export class Geo
{

    public static readonly RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
    public static readonly XSD_NS = "http://www.w3.org/2001/XMLSchema#";
    public static readonly APLT_NS = "https://w3id.org/atomgraph/linkeddatahub/templates#";
    public static readonly GEO_NS = "http://www.w3.org/2003/01/geo/wgs84_pos#"
    public static readonly FOAF_NS = "http://xmlns.com/foaf/0.1/";

    private readonly map: google.maps.Map;
    private readonly base: URL;
    private readonly endpoint: URL;
    private readonly select: string;
    private readonly focusVarName: string;
    private readonly graphVarName?: string;
    private readonly loadedResources: Map<URL, boolean>;
    private loadedBounds: google.maps.LatLngBounds | null | undefined;
    private markerBounds: google.maps.LatLngBounds;
    private fitBounds: boolean;
    private readonly icons: string[];
    private readonly typeIcons: Map<string, string>;

    constructor(map: google.maps.Map, base: URL, endpoint: URL, select: string, focusVarName: string, graphVarName?: string)
    {
        this.map = map;
        this.base = base;
        this.endpoint = endpoint;
        this.select = select;
        this.focusVarName = focusVarName;
        this.graphVarName = graphVarName;
        this.markerBounds = new google.maps.LatLngBounds();
        this.fitBounds = true;
        this.loadedResources = new Map<URL, boolean>();
        this.icons = [ "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
            "https://maps.google.com/mapfiles/ms/icons/purple-dot.png",
            "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
            "https://maps.google.com/mapfiles/ms/icons/green-dot.png" ];
        this.typeIcons = new Map<string, string>();
    }

    private getMap(): google.maps.Map
    {
        return this.map;
    }

    private getBase(): URL
    {
        return this.base;
    }

    private getEndpoint(): URL
    {
        return this.endpoint;
    }

    private getSelect(): string
    {
        return this.select;
    }

    private getFocusVarName(): string
    {
        return this.focusVarName;
    }

    private getGraphVarName(): string | undefined
    {
        return this.graphVarName;
    }

    private getLoadedResources(): Map<URL, boolean>
    {
        return this.loadedResources;
    }

    public getLoadedBounds(): google.maps.LatLngBounds | null | undefined
    {
        return this.loadedBounds;
    }

    private setLoadedBounds(bounds?: google.maps.LatLngBounds | null | undefined)
    {
        this.loadedBounds = bounds;
    }

    public getMarkerBounds(): google.maps.LatLngBounds
    {
        return this.markerBounds;
    }

    public isFitBounds(): boolean
    {
        return this.fitBounds;
    }

    private setFitBounds(fitBounds: boolean): void
    {
        this.fitBounds = fitBounds;
    }

    public getIcons(): string[]
    {
        return this.icons;
    }

    public getTypeIcons(): Map<string, string>
    {
        return this.typeIcons;
    }

    private loadMarkers(this: Geo, promise: (this: void, rdfXml: Document) => (void)): void
    {
        if (this.getMap().getBounds() == null) throw Error("Map bounds are null or undefined");

        // do not load markers if the new bounds are within already loaded bounds
        if (this.getLoadedBounds() != null &&
                this.getLoadedBounds()!.contains(this.getMap().getBounds()!.getNorthEast()) && 
                this.getLoadedBounds()!.contains(this.getMap().getBounds()!.getSouthWest()))
            return;
        
        let markerOverlay = new MapOverlay(this.getMap(), "marker-progress");
        markerOverlay.show();

        Promise.resolve(SelectBuilder.fromString(this.getSelect()).build()).
            then(this.buildQuery).
            then(this.buildQueryURL).
            then(url => url.toString()).
            then(this.requestRDFXML).
            then(response =>
            {
                if(response.ok) return response.text();

                throw new Error("Could not load RDF/XML response from '" + response.url + "'");
            }).
            then(this.parseXML).
            then(promise).
            then(() =>
            {
                this.setLoadedBounds(this.getMap().getBounds());
                if (this.isFitBounds() && !this.getMarkerBounds().isEmpty())
                {
                    this.getMap().fitBounds(this.getMarkerBounds());
                    this.setFitBounds(false); // do not fit bounds after the first load
                }

                markerOverlay.hide();
            }).
            catch(error =>
            {
                console.log('HTTP request failed: ', error.message);
            });
    }

    public addMarkers = (rdfXml: XMLDocument) =>
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
                    
                    if (latElems.length > 0 && longElems.length > 0)
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
                        this.getMarkerBounds().extend(latLng);
                        let markerConfig = <google.maps.MarkerOptions>{
                            "position": latLng,
                            // "label": label,
                            "map": this.getMap()
                        };
                        let titleElems = description.getElementsByTagNameNS("http://purl.org/dc/terms/", "title"); // TO-DO: call ac:label() via SaxonJS.XPath.evaluate()?
                        if (titleElems.length > 0) markerConfig.title = titleElems[0].textContent;

                        let marker = new google.maps.Marker(markerConfig);
                        if (icon != null) marker.setIcon(icon);
                        
                        // popout InfoWindow for the current document on click
                        if (uri !== null) this.bindMarkerClick(marker, uri); // bind loadInfoWindowHTML() to marker onclick
                    }
                }
            }
        }
    }

    protected bindMarkerClick(marker: google.maps.Marker, url: string): void
    {
        let renderInfoWindow = (event: google.maps.MapMouseEvent) =>
        {
            let overlay = new MapOverlay(this.getMap(), "infowindow-progress");
            overlay.show();
            
            Promise.resolve(url).
                then(this.buildInfoURL).
                then(url => url.toString()).
                then(this.requestHTML).
                then(response => 
                {
                    if(response.ok) return response.text();

                    throw new Error("Could not load HTML response from '" + response.url + "'");
                }).
                then(this.parseHTML).
                then(html =>
                {
                    // render first child of <body> as InfoWindow content
                    let infoContent = html.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "body")[0].children[0];

                    let infoWindow = new google.maps.InfoWindow({ "content" : infoContent });
                    overlay.hide();
                    infoWindow.open(this.getMap(), marker);
                }).
                catch(error =>
                {
                    console.log('HTTP request failed: ', error.message);
                });
        }

        marker.addListener("click", renderInfoWindow);
    }

    protected buildGeoBoundedQuery(selectQuery: SelectQuery, east: number, north: number, south: number, west: number): QueryBuilder
    {
        let boundsPattern = [
            QueryBuilder.bgp(
                [
                    QueryBuilder.triple(QueryBuilder.var(this.getFocusVarName()), QueryBuilder.uri(Geo.GEO_NS + "lat"), QueryBuilder.var("lat")),
                    QueryBuilder.triple(QueryBuilder.var(this.getFocusVarName()), QueryBuilder.uri(Geo.GEO_NS + "long"), QueryBuilder.var("long"))
                ]),
            QueryBuilder.filter(QueryBuilder.operation("<", [ QueryBuilder.var("long"), QueryBuilder.typedLiteral(east.toString(), Geo.XSD_NS + "decimal") ])),
            QueryBuilder.filter(QueryBuilder.operation("<", [ QueryBuilder.var("lat"), QueryBuilder.typedLiteral(north.toString(), Geo.XSD_NS + "decimal") ])),
            QueryBuilder.filter(QueryBuilder.operation(">", [ QueryBuilder.var("lat"), QueryBuilder.typedLiteral(south.toString(), Geo.XSD_NS + "decimal") ])),
            QueryBuilder.filter(QueryBuilder.operation(">", [ QueryBuilder.var("long"), QueryBuilder.typedLiteral(west.toString(), Geo.XSD_NS + "decimal") ]))
        ];

        let builder = DescribeBuilder.new().
            variables([ QueryBuilder.var(this.getFocusVarName()) ]).
            wherePattern(QueryBuilder.group([ selectQuery ]));

        if (this.getGraphVarName() !== undefined)
            return builder.wherePattern(QueryBuilder.union([ QueryBuilder.group(boundsPattern), QueryBuilder.graph(QueryBuilder.var(this.getGraphVarName()!), boundsPattern) ]))
        else
            return builder.wherePattern(QueryBuilder.group(boundsPattern));
    }

    public buildQuery = (selectQuery: SelectQuery): string =>
    {
        return this.buildGeoBoundedQuery(selectQuery,
            this.getMap().getBounds()!.getNorthEast().lng(),
            this.getMap().getBounds()!.getNorthEast().lat(),
            this.getMap().getBounds()!.getSouthWest().lat(),
            this.getMap().getBounds()!.getSouthWest().lng()).
            toString();
    }

    public buildQueryURL = (queryString: string): URL =>
    {
        return URLBuilder.fromURL(this.getEndpoint()).
            searchParam("query", queryString).
            build();
    }

    // this is LinkedDataHub-specific URL structure
    public buildInfoURL = (url: string): URL =>
    {
        return URLBuilder.fromURL(this.getBase()).
            searchParam("uri", url).
            searchParam("mode", Geo.APLT_NS + "InfoWindowMode").
            build();
    }

    public requestRDFXML = (url: string): Promise<Response> =>
    {
        return fetch(new Request(url, { "headers": { "Accept": "application/rdf+xml" } } ));
    }

    public requestHTML = (url: string): Promise<Response> =>
    {
        return fetch(new Request(url, { "headers": { "Accept": "text/html,*/*;q=0.8" } } ));
    }

    public parseXML(str: string): Document
    {
        return (new DOMParser()).parseFromString(str, "text/xml");
    }

    public parseHTML(str: string): Document
    {
        return (new DOMParser()).parseFromString(str, "text/html");
    }

}