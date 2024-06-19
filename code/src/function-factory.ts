import extraction from './functions/extraction/index';

export const functionFactory = {
  extraction,
} as const;

export type FunctionFactoryType = keyof typeof functionFactory;
