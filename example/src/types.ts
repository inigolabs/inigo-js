export enum FilmEdgesMap {
  Person = "has_person",
  Planet = "has_planet",
  Starship = "has_starship",
  Vehicle = "has_vehicle",
  Species = "has_species",
}

export enum PersonEdgesMap {
   Starship = "piloted_starship",
   Vehicle = "piloted_vehicle",
   Species = "is_of_type",
   Film = "appeared_in",
   Planet = "from_planet",
}

export enum PlanetEdgesMap {
   Person = "home_to",
   Film = "appeared_in",
   Species = "origin_of",
}

export enum SpeciesEdgesMap {
  Planet = "originates_from",
  Film = "appeared_in",
  Person = "includes_person",
}

export enum StarshipEdgesMap {
  Film = "appeared_in",
  Person = "piloted_by",
}

export enum VehicleEdgesMap {
  Film = "appeared_in",
  Person = "piloted_by",
}

export const EdgesMaps = {
  Film: FilmEdgesMap,
  Person: PersonEdgesMap,
  Planet: PlanetEdgesMap,
  Species: SpeciesEdgesMap,
  Starship: StarshipEdgesMap,
  Vehicle: VehicleEdgesMap,
}