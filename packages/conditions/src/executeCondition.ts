import { isDefined, isNotDefined } from "@typebot.io/lib/utils";
import { findUniqueVariable } from "@typebot.io/variables/findUniqueVariableValue";
import { parseVariables } from "@typebot.io/variables/parseVariables";
import type { Variable } from "@typebot.io/variables/schemas";
import { ComparisonOperators, LogicalOperator } from "./constants";
import type { Comparison, Condition } from "./schemas";

type Props = {
  condition: Condition;
  variables: Variable[];
};

export const executeCondition = ({ condition, variables }: Props): boolean => {
  if (!condition.comparisons) return false;
  return condition.logicalOperator === LogicalOperator.AND
    ? condition.comparisons.every(executeComparison(variables))
    : condition.comparisons.some(executeComparison(variables));
};

const executeComparison =
  (variables: Variable[]) =>
  (comparison: Comparison): boolean => {
    if (!comparison?.variableId) return false;
    const inputValue =
      variables.find((v) => v.id === comparison.variableId)?.value ?? null;
    const value =
      comparison.value === "undefined" || comparison.value === "null"
        ? null
        : (findUniqueVariable(variables)(comparison.value)?.value ??
          parseVariables(variables)(comparison.value));
    if (isNotDefined(comparison.comparisonOperator)) return false;
    switch (comparison.comparisonOperator) {
      case ComparisonOperators.CONTAINS: {
        if (Array.isArray(inputValue)) {
          const equal = (a: string | null, b: string | null) => {
            if (typeof a === "string" && typeof b === "string")
              return a.normalize() === b.normalize();
            return a !== b;
          };
          return compare(equal, inputValue, value, "some");
        }
        const contains = (a: string | null, b: string | null) => {
          if (b === "" || !b || !a) return false;
          return a
            .toLowerCase()
            .trim()
            .normalize()
            .includes(b.toLowerCase().trim().normalize());
        };
        return compare(contains, inputValue, value, "some");
      }
      case ComparisonOperators.NOT_CONTAINS: {
        if (Array.isArray(inputValue)) {
          const notEqual = (a: string | null, b: string | null) => {
            if (typeof a === "string" && typeof b === "string")
              return a.normalize() !== b.normalize();
            return a !== b;
          };
          return compare(notEqual, inputValue, value);
        }
        const notContains = (a: string | null, b: string | null) => {
          if (b === "" || !b || !a) return true;
          return !a
            .toLowerCase()
            .trim()
            .normalize()
            .includes(b.toLowerCase().trim().normalize());
        };
        return compare(notContains, inputValue, value);
      }
      case ComparisonOperators.EQUAL: {
        return compare(
          (a, b) => {
            if (typeof a === "string" && typeof b === "string")
              return a.normalize() === b.normalize();
            return a === b;
          },
          inputValue,
          value,
        );
      }
      case ComparisonOperators.NOT_EQUAL: {
        return compare(
          (a, b) => {
            if (typeof a === "string" && typeof b === "string")
              return a.normalize() !== b.normalize();
            return a !== b;
          },
          inputValue,
          value,
        );
      }
      case ComparisonOperators.GREATER: {
        if (isNotDefined(inputValue) || isNotDefined(value)) return false;
        if (typeof inputValue === "string") {
          if (typeof value === "string")
            return parseDateOrNumber(inputValue) > parseDateOrNumber(value);
          return Number(inputValue) > value.length;
        }
        if (typeof value === "string") return inputValue.length > Number(value);
        return inputValue.length > value.length;
      }
      case ComparisonOperators.LESS: {
        if (isNotDefined(inputValue) || isNotDefined(value)) return false;
        if (typeof inputValue === "string") {
          if (typeof value === "string")
            return parseDateOrNumber(inputValue) < parseDateOrNumber(value);
          return Number(inputValue) < value.length;
        }
        if (typeof value === "string") return inputValue.length < Number(value);
        return inputValue.length < value.length;
      }
      case ComparisonOperators.IS_SET: {
        return isDefined(inputValue) && inputValue.length > 0;
      }
      case ComparisonOperators.IS_EMPTY: {
        return isNotDefined(inputValue) || inputValue.length === 0;
      }
      case ComparisonOperators.STARTS_WITH: {
        const startsWith = (a: string | null, b: string | null) => {
          if (b === "" || !b || !a) return false;
          return a
            .toLowerCase()
            .trim()
            .normalize()
            .startsWith(b.toLowerCase().trim().normalize());
        };
        return compare(startsWith, inputValue, value);
      }
      case ComparisonOperators.ENDS_WITH: {
        const endsWith = (a: string | null, b: string | null) => {
          if (b === "" || !b || !a) return false;
          return a
            .toLowerCase()
            .trim()
            .normalize()
            .endsWith(b.toLowerCase().trim().normalize());
        };
        return compare(endsWith, inputValue, value);
      }
      case ComparisonOperators.MATCHES_REGEX: {
        const matchesRegex = (a: string | null, b: string | null) => {
          if (b === "" || !b || !a) return false;
          const regex = preprocessRegex(b);
          if (!regex.pattern) return false;
          return new RegExp(regex.pattern, regex.flags).test(a);
        };
        return compare(matchesRegex, inputValue, value, "some");
      }
      case ComparisonOperators.NOT_MATCH_REGEX: {
        const matchesRegex = (a: string | null, b: string | null) => {
          if (b === "" || !b || !a) return false;
          const regex = preprocessRegex(b);
          if (!regex.pattern) return true;
          return !new RegExp(regex.pattern, regex.flags).test(a);
        };
        return compare(matchesRegex, inputValue, value);
      }
      case ComparisonOperators.STRING_SIMILARITY: {
        return compararValores(inputValue as string, value as string);
      }
    }
  };

const compare = (
  compareStrings: (a: string | null, b: string | null) => boolean,
  a: Exclude<Variable["value"], undefined>,
  b: Exclude<Variable["value"], undefined>,
  type: "every" | "some" = "every",
): boolean => {
  if (!a || typeof a === "string") {
    if (!b || typeof b === "string") return compareStrings(a, b);
    return type === "every"
      ? b.every((b) => compareStrings(a, b))
      : b.some((b) => compareStrings(a, b));
  }
  if (!b || typeof b === "string") {
    return type === "every"
      ? a.every((a) => compareStrings(a, b))
      : a.some((a) => compareStrings(a, b));
  }
  if (type === "every")
    return a.every((a) => b.every((b) => compareStrings(a, b)));
  return a.some((a) => b.some((b) => compareStrings(a, b)));
};

const parseDateOrNumber = (value: string): number => {
  const parsed = Number(value);
  if (isNaN(parsed)) {
    const time = Date.parse(value);
    return time;
  }
  return parsed;
};

const preprocessRegex = (regex: string) => {
  const regexWithFlags = regex.match(/\/(.+)\/([gimuy]*)$/);

  if (regexWithFlags)
    return { pattern: regexWithFlags[1], flags: regexWithFlags[2] };

  return { pattern: regex };
};


// Función que calcula la distancia de Levenshtein
function levenshtein(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  // Creamos una matriz vacía (m + 1) x (n + 1)
  const matrix: number[][] = (<any>Array(m + 1)).fill(null).map(() => (<any>Array(n + 1)).fill(null));

  // Inicializamos la primera fila y la primera columna
  for (let i = 0; i <= m; i++) {
      matrix[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
      matrix[0][j] = j;
  }

  // Llenamos la matriz usando el algoritmo de Levenshtein
  for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
          const costoSustitucion = str1[i - 1] === str2[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(
              matrix[i - 1][j] + 1, // Eliminación
              matrix[i][j - 1] + 1, // Inserción
              matrix[i - 1][j - 1] + costoSustitucion // Sustitución
          );
      }
  }

  // El valor en la esquina inferior derecha es la distancia de Levenshtein
  return matrix[m][n];
}

// Función que calcula la similitud basada en la distancia de Levenshtein
function compareStringsBagOfNumbers(str1: string, str2: string): number {
  const distancia = levenshtein(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  return (maxLength - distancia) / maxLength;
}

// Implementación del operador de comparación
function compararValores(inputValue: string, value: string): boolean {
  let similarity = 0;
  let maxSimilarity = 0;

  if (typeof inputValue === "string") {
      if (value && typeof value === "string") {
          const values = value.split("|");
          for (const val of values) {
              console.log("inputValue:", inputValue);
              console.log("val:", val);
              similarity = compareStringsBagOfNumbers(inputValue, val);
              console.log("similarity:", similarity);
              if (similarity > maxSimilarity) {
                  maxSimilarity = similarity;
              }
          }
          console.log("maxSimilarity:", maxSimilarity);
          return maxSimilarity > 0.8;
      } else {
          return false;
      }
  } else {
      return false;
  }
}