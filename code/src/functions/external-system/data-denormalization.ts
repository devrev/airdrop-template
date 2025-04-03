import { ExternalSystemItem } from '@devrev/ts-adaas';

// TODO: Replace with the actual denormalization function for your external
// system. This function should take the normalized object and transform it into
// the format expected by the external system API.
export function denormalizeTodo(item: ExternalSystemItem): any {
  return {
    ...item,
  };
}
