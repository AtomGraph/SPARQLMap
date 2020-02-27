/// <reference types="googlemaps" />

// import { Map } from 'googlemaps'; // using <reference> instead as otherwise we would get the "@types/googlemaps/index.d.ts is not a module" error

export class MapOverlay
{

    private readonly div: HTMLElement;

    constructor(map: google.maps.Map, id: string)
    {
        let div = map.getDiv().ownerDocument!.getElementById(id);

        if (div !== null) this.div = div;
        else
        {
            this.div = map.getDiv().ownerDocument!.createElement("div");
            this.div.id = id;
            this.div.className = "progress progress-striped active";
            
            // need to set CSS properties programmatically
            this.div.style.position = "absolute";
            this.div.style.top = "17em";
            this.div.style.zIndex = "2";
            this.div.style.width = "24%";
            this.div.style.left = "38%";
            this.div.style.right = "38%";
            this.div.style.padding = "10px";
            this.div.style.visibility = "hidden";
            
            var barDiv = map.getDiv().ownerDocument!.createElement("div");
            barDiv.className = "bar";
            barDiv.style.width = "100%";
            this.div.appendChild(barDiv);
            
            map.getDiv().appendChild(this.div);
        }
    }

    public show(): void
    {
        this.div.style.visibility = "visible";
    };

    public hide(): void
    {
        this.div.style.visibility = "hidden";
    };

}