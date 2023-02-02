import { IResolvers, ISchemaLevelResolver } from '@graphql-tools/utils';
import { EdgesMaps } from './types';

const convertKeysToCamelCase = (obj: any) => {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => {
      return [
        key.replace(/([-_][a-z])/g, group => group
          .toUpperCase()
          .replace('-', '')
          .replace('_', '')
        ),
        value
      ];
    }))
  }

const getResolver = (data, sourceType: string): ISchemaLevelResolver<any, any> => {
    const map = EdgesMaps[sourceType];
  
    return (source, args, context, info) => {
      const returnType = info.returnType.toString().replace(/\[|\]|\!/g, "");
      const edge = map[returnType];
      const collection = returnType.toLowerCase();
  
      let nodes = source.edges[edge];
  
      if (!nodes) {
        nodes = data[collection].map((item, id) => ({ id, ...item })).filter(item => item.edges[EdgesMaps[returnType][sourceType]]?.includes(source.id)).map(item => item.id);
      }
  
      return nodes.map(id => convertKeysToCamelCase({ id, ...data[collection][id] }));
    }
  };

export default function(data) { // IResolvers
  return {
    Query: {
      films: () => data.film.map((obj, id) => convertKeysToCamelCase({ id, ...obj })),
      people: () => data.person.map((obj, id) => convertKeysToCamelCase({ id, ...obj })),
      planets: () => data.planet.map((obj, id) => convertKeysToCamelCase({ id, ...obj })),
      species: () => data.species.map((obj, id) => convertKeysToCamelCase({ id, ...obj })),
      starships: () => data.starship.map((obj, id) => convertKeysToCamelCase({ id, ...obj })),
      vehicles: () => data.vehicle.map((obj, id) => convertKeysToCamelCase({ id, ...obj })),
    },
    Film: {
      characters: getResolver(data, "Film"),
      planets: getResolver(data, "Film"),
      species: getResolver(data, "Film"),
      starships: getResolver(data, "Film"),
      vehicles: getResolver(data, "Film"),
    },
    Person: {
      pilotedStarship: getResolver(data, "Person"),
      pilotedVehicle: getResolver(data, "Person"),
      appearedIn: getResolver(data, "Person"),
      type: getResolver(data, "Person"),
      fromPlanet: getResolver(data, "Person"),
    },
    Planet: {
      homeTo: getResolver(data, "Planet"),
      appearedIn: getResolver(data, "Planet"),
      originOf: getResolver(data, "Planet"),
    },
    Species: {
      originatesFrom: getResolver(data, "Species"),
      appearedIn: getResolver(data, "Species"),
      includesPerson: getResolver(data, "Species"),
    },
    Starship: {
      appearedIn: getResolver(data, "Starship"),
      pilotedBy: getResolver(data, "Starship"),
    },
    Vehicle: {
      appearedIn: getResolver(data, "Vehicle"),
      pilotedBy: getResolver(data, "Vehicle"),
    }
  };
}
  