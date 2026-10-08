// Touring regions and the cities we can route through. Our own data (no Qloo
// content). Qloo heatmap points are matched to the nearest city in this list.

export type City = { name: string; country: string; lat: number; lng: number };

export type Region = {
  id: string;
  label: string;
  /** Bounding box as [west, south, east, north] in degrees. */
  bbox: [number, number, number, number];
  cities: City[];
};

export const REGIONS: Region[] = [
  {
    id: "north-america",
    label: "North America",
    bbox: [-125, 24, -66, 50],
    cities: [
      { name: "New York", country: "US", lat: 40.7128, lng: -74.006 },
      { name: "Brooklyn", country: "US", lat: 40.6782, lng: -73.9442 },
      { name: "Philadelphia", country: "US", lat: 39.9526, lng: -75.1652 },
      { name: "Boston", country: "US", lat: 42.3601, lng: -71.0589 },
      { name: "Washington", country: "US", lat: 38.9072, lng: -77.0369 },
      { name: "Atlanta", country: "US", lat: 33.749, lng: -84.388 },
      { name: "Nashville", country: "US", lat: 36.1627, lng: -86.7816 },
      { name: "Chicago", country: "US", lat: 41.8781, lng: -87.6298 },
      { name: "Minneapolis", country: "US", lat: 44.9778, lng: -93.265 },
      { name: "Detroit", country: "US", lat: 42.3314, lng: -83.0458 },
      { name: "Austin", country: "US", lat: 30.2672, lng: -97.7431 },
      { name: "Dallas", country: "US", lat: 32.7767, lng: -96.797 },
      { name: "Houston", country: "US", lat: 29.7604, lng: -95.3698 },
      { name: "New Orleans", country: "US", lat: 29.9511, lng: -90.0715 },
      { name: "Denver", country: "US", lat: 39.7392, lng: -104.9903 },
      { name: "Salt Lake City", country: "US", lat: 40.7608, lng: -111.891 },
      { name: "Phoenix", country: "US", lat: 33.4484, lng: -112.074 },
      { name: "Los Angeles", country: "US", lat: 34.0522, lng: -118.2437 },
      { name: "San Diego", country: "US", lat: 32.7157, lng: -117.1611 },
      { name: "San Francisco", country: "US", lat: 37.7749, lng: -122.4194 },
      { name: "Portland", country: "US", lat: 45.5152, lng: -122.6784 },
      { name: "Seattle", country: "US", lat: 47.6062, lng: -122.3321 },
      { name: "Toronto", country: "CA", lat: 43.6532, lng: -79.3832 },
      { name: "Montreal", country: "CA", lat: 45.5017, lng: -73.5673 },
      { name: "Vancouver", country: "CA", lat: 49.2827, lng: -123.1207 },
    ],
  },
  {
    id: "europe",
    label: "Europe",
    bbox: [-10, 36, 30, 60],
    cities: [
      { name: "London", country: "GB", lat: 51.5074, lng: -0.1278 },
      { name: "Paris", country: "FR", lat: 48.8566, lng: 2.3522 },
      { name: "Amsterdam", country: "NL", lat: 52.3676, lng: 4.9041 },
      { name: "Brussels", country: "BE", lat: 50.8503, lng: 4.3517 },
      { name: "Cologne", country: "DE", lat: 50.9375, lng: 6.9603 },
      { name: "Berlin", country: "DE", lat: 52.52, lng: 13.405 },
      { name: "Hamburg", country: "DE", lat: 53.5511, lng: 9.9937 },
      { name: "Munich", country: "DE", lat: 48.1351, lng: 11.582 },
      { name: "Copenhagen", country: "DK", lat: 55.6761, lng: 12.5683 },
      { name: "Stockholm", country: "SE", lat: 59.3293, lng: 18.0686 },
      { name: "Oslo", country: "NO", lat: 59.9139, lng: 10.7522 },
      { name: "Prague", country: "CZ", lat: 50.0755, lng: 14.4378 },
      { name: "Vienna", country: "AT", lat: 48.2082, lng: 16.3738 },
      { name: "Warsaw", country: "PL", lat: 52.2297, lng: 21.0122 },
      { name: "Zurich", country: "CH", lat: 47.3769, lng: 8.5417 },
      { name: "Milan", country: "IT", lat: 45.4642, lng: 9.19 },
      { name: "Barcelona", country: "ES", lat: 41.3874, lng: 2.1686 },
      { name: "Madrid", country: "ES", lat: 40.4168, lng: -3.7038 },
      { name: "Lisbon", country: "PT", lat: 38.7223, lng: -9.1393 },
      { name: "Dublin", country: "IE", lat: 53.3498, lng: -6.2603 },
      { name: "Manchester", country: "GB", lat: 53.4808, lng: -2.2426 },
      { name: "Glasgow", country: "GB", lat: 55.8642, lng: -4.2518 },
    ],
  },
  {
    id: "india",
    label: "India",
    bbox: [68, 7, 97, 35],
    cities: [
      { name: "Mumbai", country: "IN", lat: 19.076, lng: 72.8777 },
      { name: "Pune", country: "IN", lat: 18.5204, lng: 73.8567 },
      { name: "Delhi", country: "IN", lat: 28.6139, lng: 77.209 },
      { name: "Gurugram", country: "IN", lat: 28.4595, lng: 77.0266 },
      { name: "Bengaluru", country: "IN", lat: 12.9716, lng: 77.5946 },
      { name: "Hyderabad", country: "IN", lat: 17.385, lng: 78.4867 },
      { name: "Chennai", country: "IN", lat: 13.0827, lng: 80.2707 },
      { name: "Kolkata", country: "IN", lat: 22.5726, lng: 88.3639 },
      { name: "Goa", country: "IN", lat: 15.4909, lng: 73.8278 },
      { name: "Ahmedabad", country: "IN", lat: 23.0225, lng: 72.5714 },
      { name: "Jaipur", country: "IN", lat: 26.9124, lng: 75.7873 },
      { name: "Chandigarh", country: "IN", lat: 30.7333, lng: 76.7794 },
      { name: "Kochi", country: "IN", lat: 9.9312, lng: 76.2673 },
      { name: "Shillong", country: "IN", lat: 25.5788, lng: 91.8933 },
    ],
  },
  {
    id: "australia-nz",
    label: "Australia & New Zealand",
    bbox: [112, -47, 179, -10],
    cities: [
      { name: "Sydney", country: "AU", lat: -33.8688, lng: 151.2093 },
      { name: "Melbourne", country: "AU", lat: -37.8136, lng: 144.9631 },
      { name: "Brisbane", country: "AU", lat: -27.4698, lng: 153.0251 },
      { name: "Adelaide", country: "AU", lat: -34.9285, lng: 138.6007 },
      { name: "Perth", country: "AU", lat: -31.9505, lng: 115.8605 },
      { name: "Hobart", country: "AU", lat: -42.8821, lng: 147.3272 },
      { name: "Auckland", country: "NZ", lat: -36.8485, lng: 174.7633 },
      { name: "Wellington", country: "NZ", lat: -41.2865, lng: 174.7762 },
      { name: "Christchurch", country: "NZ", lat: -43.5321, lng: 172.6362 },
    ],
  },
];

export function getRegion(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id);
}

/** WKT polygon for a region's bounding box (Qloo wants longitude first). */
export function regionPolygon(region: Region): string {
  const [w, s, e, n] = region.bbox;
  return `POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;
}
