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
        // example inputValue  Hello
        // example value  Hi|Hello|Hey
        // split value by | and compare each value with inputValue
        let similarity = 0;
        let maxSimilarity = 0;
        if (typeof inputValue === "string") {
          const values = value.split("|");
          for (const val of values) {
            similarity = compareStringsBagOfNumbers(inputValue, val);
            if (similarity > maxSimilarity) {
              maxSimilarity = similarity;
            }
          }
          return maxSimilarity > 0.5;
        }else{
          return false;
        }
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


// string similarity function
function getBagOfNumbers(str) {
  const bag = {};

  // Convertimos el string a minúsculas para evitar diferencias por mayúsculas/minúsculas
  str = str.toLowerCase();

  // Recorremos cada carácter en la cadena
  for (let char of str) {
    if (char in bag) {
      bag[char] += 1; // Si ya existe el carácter en el bag, aumentamos su frecuencia
    } else {
      bag[char] = 1; // Si es la primera vez que aparece, lo agregamos con frecuencia 1
    }
  }

  return bag;
}

function compareStringsBagOfNumbers(str1, str2) {
  const bag1 = getBagOfNumbers(str1);
  const bag2 = getBagOfNumbers(str2);

  // Usamos un objeto para almacenar todos los caracteres únicos
  const allChars = {};

  // Agregamos los caracteres de la primera cadena
  for (let char in bag1) {
    allChars[char] = true;
  }

  // Agregamos los caracteres de la segunda cadena
  for (let char in bag2) {
    allChars[char] = true;
  }

  // Creamos vectores para cada cadena basados en la frecuencia de los caracteres
  const vec1 = [];
  const vec2 = [];

  for (let char in allChars) {
    vec1.push(bag1[char] || 0); // Si el carácter no existe en la primera cadena, ponemos un 0
    vec2.push(bag2[char] || 0); // Si el carácter no existe en la segunda cadena, ponemos un 0
  }

  // Ahora que tenemos los vectores, calculamos la similitud del coseno entre ellos
  const dotProduct = vec1.reduce((sum, val, idx) => sum + val * vec2[idx], 0);
  const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

  // Si alguna magnitud es 0, significa que uno de los vectores es vacío
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  // Similaridad del coseno
  return dotProduct / (magnitude1 * magnitude2);
}