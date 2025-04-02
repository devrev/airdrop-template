import { ExternalSystemItem } from '@devrev/ts-adaas';

export function denormalizeTodo(item: ExternalSystemItem): any {
  return {
    ...item,
  };
}
