# SPARQLMap
Generic map layout for SPARQL RDF results.

It uses a SPARQL query to load RDF resources with coordinates within the bounds of the map, and renders each as a marker, which shows an info window with HTML representation of the resource when clicked.

## Setup

SPARQLMap can be constructed with the following arguments:

<dl>
    <dt><code>map</code></dt>
    <dd><code>google.maps.Map</code></dd>
    <dd>Instance of Google Maps map</dd>
    <dt><code>endpoint</code></dt>
    <dd><code>URL</code></dd>
    <dd>URL of the SPARQL endpoint</dd>
    <dt><code>select</code></dt>
    <dd><code>string</code></dd>
    <dd>SPARQL select query string</dd>
    <dt><code>focusVarName</code></dt>
    <dd><code>string</code></dd>
    <dd>Variable which will be bound to resources that represent markers</dd>
    <dt><code>graphVarName?</code></dt>
    <dd><code>string</code></dd>
    <dd>Optional graph name variable name, in case marker resources are contained in named graphs</dd>
</dl>

## Query building

SPARQLMap will take the initial `SELECT` query, append a pattern that selects and filters the coordinates using the current viewport bounds (from the specified default and optionally named graph), and wraps it into a `DESCRIBE`.

## Example


Initial `SELECT`:

```sparql
SELECT ?s
{
    ?s ?p ?o
}
```

### Default graph

Given `focusVarName = 's'` and a current viewport bounds `((51.067080526460764, -2.8555919369506944), (51.905101013931514, 0.07458193695067283))`, the final query executed on the endpoint will look like this:
```sparql
PREFIX  geo:  <http://www.w3.org/2003/01/geo/wgs84_pos#>
PREFIX  xsd:  <http://www.w3.org/2001/XMLSchema#>

DESCRIBE ?s
WHERE
  { SELECT  ?s
    WHERE
      { ?s  ?p  ?o
        { ?s  geo:lat   ?lat ;
              geo:long  ?long
          FILTER ( ?long < 56.882781982421875 )
          FILTER ( ?lat < 66.28570153405012 )
          FILTER ( ?lat > 42.00247670093502 )
          FILTER ( ?long > -36.88278198242187 )
        }
      }
  }
```

### Named graph

Given `focusVarName = 's'`, `graphVarName = 'g'` and a current viewport bounds `((51.067080526460764, -2.8555919369506944), (51.905101013931514, 0.07458193695067283))`, the final query executed on the endpoint will look like this:
```sparql
PREFIX  geo:  <http://www.w3.org/2003/01/geo/wgs84_pos#>
PREFIX  xsd:  <http://www.w3.org/2001/XMLSchema#>

DESCRIBE ?s
WHERE
  { SELECT  ?s
    WHERE
      { ?s  ?p  ?o
          { ?s  geo:lat   ?lat ;
                geo:long  ?long
            FILTER ( ?long < 56.882781982421875 )
            FILTER ( ?lat < 66.28570153405012 )
            FILTER ( ?lat > 42.00247670093502 )
            FILTER ( ?long > -36.88278198242187 )
          }
        UNION
          { GRAPH ?g
              { { ?s  geo:lat   ?lat ;
                      geo:long  ?long
                  FILTER ( ?long < 56.882781982421875 )
                  FILTER ( ?lat < 66.28570153405012 )
                  FILTER ( ?lat > 42.00247670093502 )
                  FILTER ( ?long > -36.88278198242187 )
                }
              }
          }
      }
  }
```


## RDF data conventions

SPARQLMap will currently
* only recognize `geo:lat` and `geo:long` (from the [WGS84 Geo vocabulary](https://www.w3.org/2003/01/geo/) properties as coordinates.
* use [`foaf:isPrimaryTopicOf`](http://xmlns.com/foaf/spec/#term_isPrimaryTopicOf) and, as a fallback, [`foaf:page`](http://xmlns.com/foaf/spec/#term_page) values as URLs to load info window HTML from when a marker is clicked. Absent these properties, the info window will not be available for that resource.