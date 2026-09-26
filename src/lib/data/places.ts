/**
 * Places the agent knows about.
 *
 * Coordinates are approximate city-centre points (public geographic data) and
 * are only used for distance estimates. Gateway distances describe how far the
 * nearest airport / railhead is from where travellers will stay.
 */

export interface Origin {
  id: string;
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
}

export interface Gateway {
  name: string;
  /** Road distance from the gateway to the stay area, in km. */
  km: number;
}

export interface DestinationPlace {
  id: string;
  name: string;
  region: string;
  aliases: string[];
  lat: number;
  lng: number;
  /** Wikipedia article title for grounding (fetched live when available). */
  wikiTitle: string;
  airport: Gateway | null;
  railhead: Gateway | null;
}

export const ORIGINS: Origin[] = [
  { id: "delhi", name: "Delhi", aliases: ["delhi", "new delhi", "ncr", "gurgaon", "gurugram", "noida"], lat: 28.6139, lng: 77.209 },
  { id: "mumbai", name: "Mumbai", aliases: ["mumbai", "bombay", "navi mumbai", "thane"], lat: 19.076, lng: 72.8777 },
  { id: "bengaluru", name: "Bengaluru", aliases: ["bengaluru", "bangalore", "blr"], lat: 12.9716, lng: 77.5946 },
  { id: "kolkata", name: "Kolkata", aliases: ["kolkata", "calcutta"], lat: 22.5726, lng: 88.3639 },
  { id: "chennai", name: "Chennai", aliases: ["chennai", "madras"], lat: 13.0827, lng: 80.2707 },
  { id: "hyderabad", name: "Hyderabad", aliases: ["hyderabad", "secunderabad"], lat: 17.385, lng: 78.4867 },
];

export const DESTINATIONS: DestinationPlace[] = [
  {
    id: "rishikesh", name: "Rishikesh", region: "Uttarakhand", aliases: ["rishikesh"],
    lat: 30.0869, lng: 78.2676, wikiTitle: "Rishikesh",
    airport: { name: "Dehradun (Jolly Grant)", km: 21 }, railhead: { name: "Haridwar Junction", km: 25 },
  },
  {
    id: "manali", name: "Manali", region: "Himachal Pradesh", aliases: ["manali", "kullu manali"],
    lat: 32.2432, lng: 77.1892, wikiTitle: "Manali, Himachal Pradesh",
    airport: { name: "Bhuntar (Kullu)", km: 50 }, railhead: { name: "Chandigarh", km: 300 },
  },
  {
    id: "jaipur", name: "Jaipur", region: "Rajasthan", aliases: ["jaipur", "pink city"],
    lat: 26.9124, lng: 75.7873, wikiTitle: "Jaipur",
    airport: { name: "Jaipur International", km: 12 }, railhead: { name: "Jaipur Junction", km: 4 },
  },
  {
    id: "udaipur", name: "Udaipur", region: "Rajasthan", aliases: ["udaipur", "city of lakes"],
    lat: 24.5854, lng: 73.7125, wikiTitle: "Udaipur",
    airport: { name: "Udaipur (Maharana Pratap)", km: 22 }, railhead: { name: "Udaipur City", km: 3 },
  },
  {
    id: "varanasi", name: "Varanasi", region: "Uttar Pradesh", aliases: ["varanasi", "banaras", "benares", "kashi"],
    lat: 25.3176, lng: 82.9739, wikiTitle: "Varanasi",
    airport: { name: "Varanasi (Lal Bahadur Shastri)", km: 25 }, railhead: { name: "Varanasi Junction", km: 5 },
  },
  {
    id: "amritsar", name: "Amritsar", region: "Punjab", aliases: ["amritsar"],
    lat: 31.634, lng: 74.8723, wikiTitle: "Amritsar",
    airport: { name: "Amritsar (Sri Guru Ram Dass Jee)", km: 12 }, railhead: { name: "Amritsar Junction", km: 3 },
  },
  {
    id: "goa", name: "Goa", region: "Goa", aliases: ["goa", "panaji", "panjim", "north goa", "south goa"],
    lat: 15.4909, lng: 73.8278, wikiTitle: "Goa",
    airport: { name: "Goa (Dabolim / Mopa)", km: 30 }, railhead: { name: "Madgaon / Thivim", km: 20 },
  },
  {
    id: "munnar", name: "Munnar", region: "Kerala", aliases: ["munnar", "kerala"],
    lat: 10.0889, lng: 77.0595, wikiTitle: "Munnar",
    airport: { name: "Kochi International", km: 110 }, railhead: { name: "Aluva", km: 110 },
  },
  {
    id: "darjeeling", name: "Darjeeling", region: "West Bengal", aliases: ["darjeeling"],
    lat: 27.041, lng: 88.2663, wikiTitle: "Darjeeling",
    airport: { name: "Bagdogra", km: 70 }, railhead: { name: "New Jalpaiguri", km: 70 },
  },
  {
    id: "coorg", name: "Coorg", region: "Karnataka", aliases: ["coorg", "kodagu", "madikeri"],
    lat: 12.4244, lng: 75.7382, wikiTitle: "Kodagu district",
    airport: { name: "Mangaluru International", km: 135 }, railhead: { name: "Mysuru Junction", km: 120 },
  },
  {
    id: "pondicherry", name: "Pondicherry", region: "Puducherry", aliases: ["pondicherry", "puducherry", "pondy"],
    lat: 11.9416, lng: 79.8083, wikiTitle: "Pondicherry",
    airport: { name: "Chennai International", km: 150 }, railhead: { name: "Puducherry", km: 3 },
  },
  {
    id: "hampi", name: "Hampi", region: "Karnataka", aliases: ["hampi"],
    lat: 15.335, lng: 76.46, wikiTitle: "Hampi",
    airport: { name: "Hubballi", km: 165 }, railhead: { name: "Hosapete Junction", km: 13 },
  },
];

export function findOrigin(id: string): Origin | undefined {
  return ORIGINS.find((o) => o.id === id);
}

export function findDestination(id: string): DestinationPlace | undefined {
  return DESTINATIONS.find((d) => d.id === id);
}

export function getOrigin(id: string): Origin {
  const origin = findOrigin(id);
  if (!origin) throw new Error(`Unknown origin: ${id}`);
  return origin;
}

export function getDestination(id: string): DestinationPlace {
  const destination = findDestination(id);
  if (!destination) throw new Error(`Unknown destination: ${id}`);
  return destination;
}
