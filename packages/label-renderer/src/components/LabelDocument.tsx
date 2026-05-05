import * as React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { LabelData } from '../types';
import { LOCALE_STRINGS, localizeAllergen } from '../locales';
import { PAGE_GEOMETRY } from '../page-sizes';

/**
 * EU 1169/2011 compliant label, multi-format. Five sections in fixed order:
 *
 *   1. Header   — recipe name + business name + brand mark (if configured)
 *   2. Ingredients — Article 18 descending mass (allergens emphasized inline)
 *   3. Allergens panel — Article 21 bold + icon-text always (never colour-only)
 *   4. Macros panel — kcal/macros per 100g
 *   5. Footer   — net quantity per portion + business address + contact info
 *
 * Cross-contamination disclosure ("May contain traces of …") is rendered
 * between the allergens panel and the macros panel when present on the
 * Recipe (#7).
 */

interface LabelDocumentProps {
  data: LabelData;
}

const ALLERGEN_ICON_PREFIX = '⚠️'; // ⚠️ rendered as text — icon+text always per NFR Accessibility.

export const LabelDocument: React.FC<LabelDocumentProps> = ({ data }) => {
  const geometry = PAGE_GEOMETRY[data.pageSize];
  const strings = LOCALE_STRINGS[data.locale];
  const styles = makeStyles(geometry);
  const allergenSet = new Set(data.recipe.allergens);

  const netPerPortionG =
    data.recipe.portions >= 1
      ? Math.round(data.recipe.totalNetMassG / data.recipe.portions)
      : data.recipe.totalNetMassG;

  return (
    <Document>
      <Page size={geometry.size} style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.recipeName}>{data.recipe.name}</Text>
          <Text style={styles.businessName}>{data.org.businessName}</Text>
        </View>

        {/* Ingredients */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>{strings.ingredients}</Text>
          <Text style={styles.ingredientList}>
            {data.recipe.ingredientList.map((row, idx) => {
              const isAllergen = row.allergens.some((a) => allergenSet.has(a));
              return (
                <Text key={`${row.name}-${idx}`}>
                  {idx > 0 ? ', ' : ''}
                  {isAllergen ? (
                    <Text style={styles.allergenInline}>
                      {ALLERGEN_ICON_PREFIX} {row.name}
                    </Text>
                  ) : (
                    row.name
                  )}
                </Text>
              );
            })}
          </Text>
        </View>

        {/* Allergens panel — Article 21 emphasis */}
        {data.recipe.allergens.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>{strings.allergens}</Text>
            <View style={styles.allergenPanel}>
              {data.recipe.allergens.map((a) => (
                <Text key={a} style={styles.allergenBadge}>
                  {ALLERGEN_ICON_PREFIX} {localizeAllergen(a, data.locale)}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* Cross-contamination disclosure (#7) */}
        {data.recipe.crossContamination && data.recipe.crossContamination.allergens.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.crossContamination}>
              {strings.crossContaminationPreface}{' '}
              {data.recipe.crossContamination.allergens
                .map((a) => localizeAllergen(a, data.locale))
                .join(', ')}
            </Text>
          </View>
        )}

        {/* Macros */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>{strings.nutritionPer100g}</Text>
          <View style={styles.macroGrid}>
            <Text>
              {strings.kcal}: {data.recipe.macros.kcalPer100g.toFixed(0)}
            </Text>
            <Text>
              {strings.fat}: {data.recipe.macros.fatPer100g.toFixed(1)} g
            </Text>
            <Text style={styles.macroSub}>
              {strings.saturatedFat}: {data.recipe.macros.saturatedFatPer100g.toFixed(1)} g
            </Text>
            <Text>
              {strings.carbohydrates}: {data.recipe.macros.carbohydratesPer100g.toFixed(1)} g
            </Text>
            <Text style={styles.macroSub}>
              {strings.sugars}: {data.recipe.macros.sugarsPer100g.toFixed(1)} g
            </Text>
            <Text>
              {strings.protein}: {data.recipe.macros.proteinPer100g.toFixed(1)} g
            </Text>
            <Text>
              {strings.salt}: {data.recipe.macros.saltPer100g.toFixed(2)} g
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.netQuantity}>
            {strings.netQuantity}: {netPerPortionG} g {strings.perPortion} (
            {data.recipe.portions} {strings.portions})
          </Text>
          <Text style={styles.address}>
            {data.org.postalAddress.street}, {data.org.postalAddress.city}{' '}
            {data.org.postalAddress.postalCode}, {data.org.postalAddress.country}
          </Text>
          {data.org.contactInfo?.email && (
            <Text style={styles.address}>{data.org.contactInfo.email}</Text>
          )}
          {data.org.contactInfo?.phone && (
            <Text style={styles.address}>{data.org.contactInfo.phone}</Text>
          )}
        </View>
      </Page>
    </Document>
  );
};

function makeStyles(geometry: { padding: number; bodyFontSize: number }) {
  const headingSize = geometry.bodyFontSize + 2;
  const recipeNameSize = geometry.bodyFontSize + 6;
  return StyleSheet.create({
    page: {
      padding: geometry.padding,
      fontSize: geometry.bodyFontSize,
      fontFamily: 'Helvetica',
      color: '#000000',
    },
    header: {
      marginBottom: geometry.padding * 0.5,
    },
    recipeName: {
      fontSize: recipeNameSize,
      fontFamily: 'Helvetica-Bold',
      marginBottom: 2,
    },
    businessName: {
      fontSize: geometry.bodyFontSize,
      fontFamily: 'Helvetica',
    },
    section: {
      marginBottom: geometry.padding * 0.4,
    },
    sectionHeader: {
      fontSize: headingSize,
      fontFamily: 'Helvetica-Bold',
      marginBottom: 2,
    },
    ingredientList: {
      lineHeight: 1.3,
    },
    allergenInline: {
      fontFamily: 'Helvetica-Bold',
      color: '#000000',
    },
    allergenPanel: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    allergenBadge: {
      fontFamily: 'Helvetica-Bold',
      borderWidth: 1,
      borderColor: '#000000',
      paddingHorizontal: 4,
      paddingVertical: 1,
      marginRight: 4,
      marginBottom: 2,
      backgroundColor: '#FFFFFF',
    },
    crossContamination: {
      fontStyle: 'italic',
    },
    macroGrid: {
      lineHeight: 1.4,
    },
    macroSub: {
      paddingLeft: 8,
    },
    footer: {
      marginTop: geometry.padding * 0.6,
      borderTopWidth: 1,
      borderTopColor: '#000000',
      paddingTop: 4,
    },
    netQuantity: {
      fontFamily: 'Helvetica-Bold',
    },
    address: {
      fontSize: geometry.bodyFontSize - 1,
    },
  });
}
