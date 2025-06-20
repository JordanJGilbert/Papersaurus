import React, { memo, useEffect, useState } from 'react';
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps';

// Define the structure for our map themes
export interface MapTheme {
  name: string;
  mapTypeStyles: google.maps.MapTypeStyle[];
  routeColor: string;
  // Potentially add other theme-specific properties like marker icons, etc.
}

// Updated Modern Light Theme (replaces old defaultTheme)
export const defaultTheme: MapTheme = {
  name: 'Modern Light',
  mapTypeStyles: [
    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
    {
      featureType: 'administrative.land_parcel',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#bdbdbd' }],
    },
    {
      featureType: 'poi',
      elementType: 'geometry',
      stylers: [{ color: '#eeeeee' }],
    },
    {
      featureType: 'poi',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#757575' }],
    },
    {
      featureType: 'poi.park',
      elementType: 'geometry',
      stylers: [{ color: '#e5e5e5' }],
    },
    {
      featureType: 'poi.park',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#9e9e9e' }],
    },
    {
      featureType: 'road',
      elementType: 'geometry',
      stylers: [{ color: '#ffffff' }],
    },
    {
      featureType: 'road.arterial',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#757575' }],
    },
    {
      featureType: 'road.highway',
      elementType: 'geometry',
      stylers: [{ color: '#dadada' }],
    },
    {
      featureType: 'road.highway',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#616161' }],
    },
    {
      featureType: 'road.local',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#9e9e9e' }],
    },
    {
      featureType: 'transit.line',
      elementType: 'geometry',
      stylers: [{ color: '#e5e5e5' }],
    },
    {
      featureType: 'transit.station',
      elementType: 'geometry',
      stylers: [{ color: '#eeeeee' }],
    },
    {
      featureType: 'water',
      elementType: 'geometry',
      stylers: [{ color: '#c9c9c9' }],
    },
    {
      featureType: 'water',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#9e9e9e' }],
    },
  ],
  routeColor: '#4285F4', // Google Blue for a modern, clean route
};

// Updated Modern Dark Theme (replaces old nightTheme)
export const nightTheme: MapTheme = {
  name: 'Modern Dark',
  mapTypeStyles: [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    {
      featureType: "administrative.locality",
      elementType: "labels.text.fill",
      stylers: [{ color: "#d59563" }],
    },
    {
      featureType: "poi",
      elementType: "labels.text.fill",
      stylers: [{ color: "#d59563" }],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [{ color: "#263c3f" }],
    },
    {
      featureType: "poi.park",
      elementType: "labels.text.fill",
      stylers: [{ color: "#6b9a76" }],
    },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#38414e" }],
    },
    {
      featureType: "road",
      elementType: "geometry.stroke",
      stylers: [{ color: "#212a37" }],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [{ color: "#9ca5b3" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [{ color: "#746855" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry.stroke",
      stylers: [{ color: "#1f2835" }],
    },
    {
      featureType: "road.highway",
      elementType: "labels.text.fill",
      stylers: [{ color: "#f3d19c" }],
    },
    {
      featureType: "transit",
      elementType: "geometry",
      stylers: [{ color: "#2f3948" }],
    },
    {
      featureType: "transit.station",
      elementType: "labels.text.fill",
      stylers: [{ color: "#d59563" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#17263c" }],
    },
    {
      featureType: "water",
      elementType: "labels.text.fill",
      stylers: [{ color: "#515c6d" }],
    },
    {
      featureType: "water",
      elementType: "labels.text.stroke",
      stylers: [{ color: "#17263c" }],
    },
  ],
  routeColor: '#80CBC4', // A teal/mint color for the route, contrasts well with dark
};

// Helper function to decode polyline
const decodePolyline = (encodedPath: string): google.maps.LatLngLiteral[] => {
  if (!window.google || !window.google.maps || !window.google.maps.geometry) {
    console.warn('[MapDisplay.tsx] Google Maps Geometry library not loaded yet for polyline decoding.');
    return [];
  }
  return window.google.maps.geometry.encoding.decodePath(encodedPath).map(p => ({ lat: p.lat(), lng: p.lng() }));
};

interface MapDisplayProps {
  directionsResponse: any;
  googleMapsApiKey: string;
  showTraffic: boolean;
  theme?: MapTheme; // Added theme prop
}

const containerStyle = {
  width: '100%',
  height: '400px'
};

const defaultCenter = {
  lat: 39.8283,
  lng: -98.5795
};
const defaultZoom = 5;

// This component will handle drawing the polyline and fitting bounds
const RoutePolyline: React.FC<{ directionsResponse: any, routeColor?: string }> = ({ directionsResponse, routeColor = defaultTheme.routeColor }) => {
  const map = useMap();
  const [polyline, setPolyline] = useState<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;

    // Clear existing polyline if any
    if (polyline) {
      polyline.setMap(null);
    }

    if (directionsResponse && directionsResponse.routes && directionsResponse.routes[0]) {
      const route = directionsResponse.routes[0];
      if (route.overview_polyline && route.overview_polyline.points) {
        if (window.google && window.google.maps && window.google.maps.geometry) {
          const decodedPath = decodePolyline(route.overview_polyline.points);

          if (decodedPath.length > 0) {
            const newPolyline = new window.google.maps.Polyline({
              path: decodedPath,
              strokeColor: routeColor,
              strokeOpacity: 0.75,
              strokeWeight: 5,
              map: map
            });
            setPolyline(newPolyline);

            const bounds = new window.google.maps.LatLngBounds();
            decodedPath.forEach(point => bounds.extend(point));
            map.fitBounds(bounds);

            // Adjust zoom after fitBounds, with a slight delay if necessary for map to settle
            setTimeout(() => {
                if (map.getProjection() && typeof map.getZoom() === 'number') {
                    const currentZoom = map.getZoom()!;
                    // Prevent over-zooming, cap at a reasonable level like 15 or 16
                    // also, fitBounds might make it too tight, so we can optionally zoom out one level
                    let newZoom = Math.min(currentZoom, 16);
                    if (decodedPath.length > 1 && currentZoom === map.getZoom()) { // if fitbounds didn't change zoom much
                        // newZoom = Math.max(newZoom -1, 2); // zoom out slightly
                    }
                    map.setZoom(newZoom);
    
                    if (decodedPath.length === 1) {
                        map.setCenter(decodedPath[0]);
                        map.setZoom(14); 
                    }
                } else {
                    console.warn('[MapDisplay.tsx] Map projection or zoom not available for adjustment after fitBounds.');
                }
            }, 100); // Small delay for map to process fitBounds

          } else {
            setPolyline(null); // No path to draw
          }
        } else {
          console.warn('[MapDisplay.tsx] Geometry library not ready for polyline decoding.');
        }
      } else {
        setPolyline(null); // No overview_polyline
      }
    } else {
      setPolyline(null); // No directionsResponse
    }

    // Cleanup: remove polyline when component unmounts or dependencies change
    return () => {
      if (polyline) {
        polyline.setMap(null);
      }
    };
  }, [map, directionsResponse, routeColor]);

  return null; // This component only draws on the map, doesn't render its own DOM element
};

// New component to manage the traffic layer
const TrafficLayerControl: React.FC<{ showTraffic: boolean }> = ({ showTraffic }) => {
  const map = useMap();
  const [trafficLayer, setTrafficLayer] = useState<google.maps.TrafficLayer | null>(null);

  useEffect(() => {
    if (!map) return;

    if (showTraffic) {
      if (!trafficLayer) { // Only create if it doesn't exist
        const newTrafficLayer = new window.google.maps.TrafficLayer();
        newTrafficLayer.setMap(map);
        setTrafficLayer(newTrafficLayer);
        console.log('[MapDisplay.tsx] Traffic layer enabled.');
      } else {
        trafficLayer.setMap(map); // Ensure it's on the current map instance if map re-instantiated
        console.log('[MapDisplay.tsx] Traffic layer re-enabled on map.');
      }
    } else {
      if (trafficLayer) {
        trafficLayer.setMap(null);
        // setTrafficLayer(null); // Optional: nullify if you want it to be recreated next time
        console.log('[MapDisplay.tsx] Traffic layer disabled.');
      }
    }
    // No cleanup needed for setMap(null) beyond what's done above for toggling
  }, [map, showTraffic, trafficLayer]);

  return null; // This component is for control, doesn't render UI elements itself
};

const MapDisplay: React.FC<MapDisplayProps> = ({ directionsResponse, googleMapsApiKey, showTraffic, theme = defaultTheme }) => {
  if (!googleMapsApiKey) {
    return <div style={{color: 'red', padding: '20px', border: '1px solid red'}}>Error: Google Maps API Key is missing. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.</div>;
  }
  
  return (
    <APIProvider apiKey={googleMapsApiKey} libraries={['geometry']} onLoad={() => console.log('[MapDisplay.tsx] APIProvider loaded with libraries.')}>
      <Map
        style={containerStyle}
        defaultCenter={defaultCenter}
        defaultZoom={defaultZoom}
        gestureHandling={'greedy'}
        disableDefaultUI={false}
        styles={theme.mapTypeStyles}
        onCameraChanged={(ev) => console.log('[MapDisplay.tsx] Map camera changed:', ev.detail.center, ev.detail.zoom)}
      >
        {/* Optional: Add markers for start and end points */}
        {directionsResponse?.routes?.[0]?.legs?.[0]?.start_location && 
            <Marker
                position={directionsResponse.routes[0].legs[0].start_location} 
                title={`Start: ${directionsResponse.routes[0].legs[0].start_address}`} 
            /> 
        }
        {directionsResponse?.routes?.[0]?.legs?.[0]?.end_location && 
            <Marker
                position={directionsResponse.routes[0].legs[0].end_location} 
                title={`End: ${directionsResponse.routes[0].legs[0].end_address}`} 
            />
        }
        <RoutePolyline directionsResponse={directionsResponse} routeColor={theme.routeColor} />
        <TrafficLayerControl showTraffic={showTraffic} />
      </Map>
    </APIProvider>
  );
};

export default memo(MapDisplay); 