import { Category, Material, Subject, AuthSession } from '../types';

export interface CategoryUnlockStatus {
  isUnlocked: boolean;
  requiredCategory?: Category;
  requiredCatNumber?: number;
  isPrereqConfigured?: boolean;
}

export interface MaterialUnlockStatus {
  isUnlocked: boolean;
  reason?: 'parent_topic_locked' | 'material_locked' | 'quiz_score_insufficient';
  requiredCategory?: Category;
  requiredCatNumber?: number;
  requiredMaterial?: Material;
  requiredLabel?: string;
  minQuizScore?: number;
  currentScore?: number;
  totalQuestions?: number;
}

/**
 * Checks if a category is canonically the first topic in its subject
 */
export function isFirstCategoryInSubject(
  categoryOrOrder: { id?: string; subjectId?: string; order?: number },
  allCategories: Category[],
  subjectId?: string
): boolean {
  const targetSubjId = categoryOrOrder.subjectId || subjectId || 'informatika';
  const sameSubjCats = allCategories
    .filter((c) => (c.subjectId || 'informatika') === targetSubjId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (sameSubjCats.length === 0) return true;
  
  if (categoryOrOrder.id) {
    return sameSubjCats[0].id === categoryOrOrder.id;
  }
  
  const orderNum = Number(categoryOrOrder.order || 1);
  return orderNum <= (sameSubjCats[0]?.order || 1);
}

/**
 * Checks if a material is canonically the first material in its category
 */
export function isFirstMaterialInCategory(
  materialOrOrder: { id?: string; categoryId?: string; order?: number },
  allMaterials: Material[],
  categoryId?: string
): boolean {
  const targetCatId = materialOrOrder.categoryId || categoryId;
  if (!targetCatId) return true;

  const sameCatMats = allMaterials
    .filter((m) => m.categoryId === targetCatId && m.isPublished !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (sameCatMats.length === 0) return true;

  if (materialOrOrder.id) {
    return sameCatMats[0].id === materialOrOrder.id;
  }

  const orderNum = Number(materialOrOrder.order || 1);
  return orderNum <= (sameCatMats[0]?.order || 1);
}

/**
 * Validates whether a category is unlocked for the current student.
 * Rule: First topic of a subject is ALWAYS unlocked and cannot be locked.
 */
export function checkCategoryUnlockStatus(
  category: Category,
  allCategories: Category[],
  allMaterials: Material[],
  completedMaterialIds: string[],
  authSession?: AuthSession | null
): CategoryUnlockStatus {
  const isTeacherOrAdmin = authSession?.role === 'admin' || authSession?.role === 'teacher';
  if (isTeacherOrAdmin) {
    return { isUnlocked: true, isPrereqConfigured: false };
  }

  const subjId = category.subjectId || 'informatika';
  const sequentialCategories = allCategories
    .filter((c) => (c.subjectId || 'informatika') === subjId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const catIndex = sequentialCategories.findIndex((c) => c.id === category.id);

  // RULE 1: First topic in subject is ALWAYS UNLOCKED
  if (catIndex <= 0) {
    return { isUnlocked: true, isPrereqConfigured: false };
  }

  // Prerequisite is only active if explicitly enabled via requirePreviousCompleted
  const isPrereqEnabled = Boolean(category.requirePreviousCompleted);
  const hasSpecificPrereq = isPrereqEnabled && Boolean(category.prerequisiteCategoryId && category.prerequisiteCategoryId !== 'none');

  if (!isPrereqEnabled) {
    return { isUnlocked: true, isPrereqConfigured: false };
  }

  // Check specific prerequisite category
  if (hasSpecificPrereq && category.prerequisiteCategoryId !== 'previous') {
    const reqCat = allCategories.find((c) => c.id === category.prerequisiteCategoryId);
    if (reqCat) {
      const reqMats = allMaterials.filter((m) => m.categoryId === reqCat.id && m.isPublished);
      const isReqCompleted = reqMats.length === 0 || reqMats.every((m) => completedMaterialIds.includes(m.id));
      const reqCatIdx = sequentialCategories.findIndex((c) => c.id === reqCat.id);
      const reqCatNum = reqCatIdx >= 0 ? reqCatIdx + 1 : reqCat.order || 1;

      return {
        isUnlocked: isReqCompleted,
        requiredCategory: reqCat,
        requiredCatNumber: reqCatNum,
        isPrereqConfigured: true,
      };
    }
  }

  // Default: Requires previous topic in sequential order
  const prevCat = sequentialCategories[catIndex - 1];
  if (prevCat) {
    const prevMats = allMaterials.filter((m) => m.categoryId === prevCat.id && m.isPublished);
    const isPrevCompleted = prevMats.length === 0 || prevMats.every((m) => completedMaterialIds.includes(m.id));

    return {
      isUnlocked: isPrevCompleted,
      requiredCategory: prevCat,
      requiredCatNumber: catIndex,
      isPrereqConfigured: true,
    };
  }

  return { isUnlocked: true, isPrereqConfigured: false };
}

/**
 * Validates whether a material is unlocked for the current student.
 * Rules:
 * 1. If parent topic is locked, ALL materials in that topic (including the 1st material) are locked!
 * 2. If parent topic is unlocked, the 1st material in that topic is ALWAYS unlocked and cannot be locked.
 * 3. Subsequent materials (order > 1) can have prerequisite locks.
 */
export function checkMaterialUnlockStatus(
  material: Material,
  allMaterials: Material[],
  allCategories: Category[],
  completedMaterialIds: string[],
  authSession?: AuthSession | null,
  studentScores?: Record<string, any>,
  minQuizScoreToUnlock: number = 8
): MaterialUnlockStatus {
  const isTeacherOrAdmin = authSession?.role === 'admin' || authSession?.role === 'teacher';
  if (isTeacherOrAdmin) {
    return { isUnlocked: true };
  }

  // Step 1: Check if the Parent Category itself is locked
  const parentCategory = allCategories.find((c) => c.id === material.categoryId);
  if (parentCategory) {
    const catStatus = checkCategoryUnlockStatus(
      parentCategory,
      allCategories,
      allMaterials,
      completedMaterialIds,
      authSession
    );

    if (!catStatus.isUnlocked) {
      // Parent topic is locked -> material is automatically locked!
      return {
        isUnlocked: false,
        reason: 'parent_topic_locked',
        requiredCategory: catStatus.requiredCategory,
        requiredCatNumber: catStatus.requiredCatNumber,
      };
    }
  }

  // Step 2: Parent Category is unlocked. Check material's own prerequisite rules.
  const sameCatPublishedMats = allMaterials
    .filter((m) => m.categoryId === material.categoryId && m.isPublished !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const matIndex = sameCatPublishedMats.findIndex((m) => m.id === material.id);

  // RULE 2: First material of an unlocked topic is ALWAYS UNLOCKED
  if (matIndex <= 0) {
    return { isUnlocked: true };
  }

  // Teacher manual unlock override
  if (material.isManuallyUnlocked) {
    return { isUnlocked: true };
  }

  const isPrereqEnabled = Boolean(material.requirePreviousCompleted);
  const hasSpecificPrereq = isPrereqEnabled && Boolean(material.prerequisiteMaterialId && material.prerequisiteMaterialId !== 'none');

  if (!isPrereqEnabled) {
    return { isUnlocked: true };
  }

  // Evaluate prerequisite requirement with quiz passing score validation
  const evaluatePrereq = (reqMat: Material, reqLabel: string): MaterialUnlockStatus => {
    const isReqCompleted = completedMaterialIds.includes(reqMat.id);

    // If student has a quiz score record for reqMat
    const scoreRecord = studentScores ? studentScores[reqMat.id] : undefined;
    if (scoreRecord !== undefined && scoreRecord !== null) {
      let correctCount = 0;
      let totalQ = 10;
      if (typeof scoreRecord === 'number') {
        correctCount = Math.round((scoreRecord / 100) * 10);
      } else if (typeof scoreRecord === 'object') {
        correctCount = scoreRecord.score ?? 0;
        totalQ = scoreRecord.totalQuestions || 10;
      }

      // If highest correct answer is less than threshold
      if (correctCount < minQuizScoreToUnlock) {
        return {
          isUnlocked: false,
          reason: 'quiz_score_insufficient',
          requiredMaterial: reqMat,
          requiredLabel: reqLabel,
          minQuizScore: minQuizScoreToUnlock,
          currentScore: correctCount,
          totalQuestions: totalQ,
        };
      }
    } else if (!isReqCompleted) {
      // Prerequisite material has not been completed
      return {
        isUnlocked: false,
        reason: 'material_locked',
        requiredMaterial: reqMat,
        requiredLabel: reqLabel,
        minQuizScore: minQuizScoreToUnlock,
        currentScore: 0,
        totalQuestions: 10,
      };
    }

    return {
      isUnlocked: true,
      requiredMaterial: reqMat,
      requiredLabel: reqLabel,
    };
  };

  // Specific prerequisite material
  if (hasSpecificPrereq && material.prerequisiteMaterialId !== 'previous') {
    const reqMat = allMaterials.find((m) => m.id === material.prerequisiteMaterialId);
    if (reqMat) {
      const reqIdx = sameCatPublishedMats.findIndex((m) => m.id === reqMat.id);
      const reqLabel = reqIdx >= 0 ? `Materi ${reqIdx + 1}` : `Materi #${reqMat.order}`;
      return evaluatePrereq(reqMat, reqLabel);
    }
  }

  // Default: Requires previous material in sequence
  const prevMat = sameCatPublishedMats[matIndex - 1];
  if (prevMat) {
    const prevLabel = `Materi ${matIndex}`;
    return evaluatePrereq(prevMat, prevLabel);
  }

  return { isUnlocked: true };
}

export interface CategoryPrerequisiteChain {
  immediateRequiredCategory: Category;
  immediateRequiredCatNumber: number;
  isImmediateRequiredUnlocked: boolean;
  activeAvailableCategory: Category;
  activeAvailableCatNumber: number;
  explanation?: string;
}

export function getCategoryPrerequisiteChain(
  category: Category,
  allCategories: Category[],
  allMaterials: Material[],
  completedMaterialIds: string[],
  authSession?: AuthSession | null
): CategoryPrerequisiteChain | null {
  const isTeacherOrAdmin = authSession?.role === 'admin' || authSession?.role === 'teacher';
  if (isTeacherOrAdmin) return null;

  const currentStatus = checkCategoryUnlockStatus(category, allCategories, allMaterials, completedMaterialIds, authSession);
  if (currentStatus.isUnlocked || !currentStatus.requiredCategory) {
    return null;
  }

  const subjId = category.subjectId || 'informatika';
  const sequentialCategories = allCategories
    .filter((c) => (c.subjectId || 'informatika') === subjId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const immediateReq = currentStatus.requiredCategory;
  const immediateIdx = sequentialCategories.findIndex((c) => c.id === immediateReq.id);
  const immediateNum = immediateIdx >= 0 ? immediateIdx + 1 : immediateReq.order || 1;

  const immediateStatus = checkCategoryUnlockStatus(immediateReq, allCategories, allMaterials, completedMaterialIds, authSession);

  if (immediateStatus.isUnlocked) {
    return {
      immediateRequiredCategory: immediateReq,
      immediateRequiredCatNumber: immediateNum,
      isImmediateRequiredUnlocked: true,
      activeAvailableCategory: immediateReq,
      activeAvailableCatNumber: immediateNum,
    };
  }

  // Immediate prerequisite is ALSO locked. Trace backward in prerequisite chain to find earliest unlocked topic
  let curr: Category = immediateReq;
  const visited = new Set<string>([category.id, immediateReq.id]);
  let activeCat: Category = sequentialCategories[0] || immediateReq;

  while (curr) {
    const status = checkCategoryUnlockStatus(curr, allCategories, allMaterials, completedMaterialIds, authSession);
    if (status.isUnlocked) {
      activeCat = curr;
      break;
    }
    if (!status.requiredCategory || visited.has(status.requiredCategory.id)) {
      activeCat = sequentialCategories[0] || curr;
      break;
    }
    visited.add(status.requiredCategory.id);
    curr = status.requiredCategory;
  }

  const activeIdx = sequentialCategories.findIndex((c) => c.id === activeCat.id);
  const activeNum = activeIdx >= 0 ? activeIdx + 1 : activeCat.order || 1;

  return {
    immediateRequiredCategory: immediateReq,
    immediateRequiredCatNumber: immediateNum,
    isImmediateRequiredUnlocked: false,
    activeAvailableCategory: activeCat,
    activeAvailableCatNumber: activeNum,
    explanation: `Topik #${immediateNum} (${immediateReq.title}) saat ini masih terkunci karena modul pada Topik #${activeNum} (${activeCat.title}) belum diselesaikan.`,
  };
}

export interface MaterialPrerequisiteChain {
  immediateRequiredMaterial: Material;
  immediateRequiredLabel: string;
  isImmediateRequiredUnlocked: boolean;
  activeAvailableMaterial: Material;
  activeAvailableLabel: string;
  reason?: 'parent_topic_locked' | 'material_locked' | 'quiz_score_insufficient';
  explanation?: string;
  minQuizScore?: number;
  currentScore?: number;
  totalQuestions?: number;
}

export function getMaterialPrerequisiteChain(
  material: Material,
  allMaterials: Material[],
  allCategories: Category[],
  completedMaterialIds: string[],
  authSession?: AuthSession | null,
  studentScores?: Record<string, any>,
  minQuizScoreToUnlock: number = 8
): MaterialPrerequisiteChain | null {
  const isTeacherOrAdmin = authSession?.role === 'admin' || authSession?.role === 'teacher';
  if (isTeacherOrAdmin) return null;

  const currentStatus = checkMaterialUnlockStatus(
    material,
    allMaterials,
    allCategories,
    completedMaterialIds,
    authSession,
    studentScores,
    minQuizScoreToUnlock
  );

  if (currentStatus.isUnlocked || !currentStatus.requiredMaterial) {
    return null;
  }

  const sameCatPublishedMats = allMaterials
    .filter((m) => m.categoryId === material.categoryId && m.isPublished !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const getMatLabel = (mat: Material) => {
    const idx = sameCatPublishedMats.findIndex((m) => m.id === mat.id);
    if (idx < 0) return `Materi #${mat.order}`;
    const isForm =
      mat.type === 'gform' ||
      mat.originalUrl?.includes('docs.google.com/forms') ||
      mat.originalUrl?.includes('forms.gle') ||
      mat.embedUrl?.includes('docs.google.com/forms') ||
      mat.embedUrl?.includes('forms.gle');
    return isForm ? `Test ${idx + 1}` : `Materi ${idx + 1}`;
  };

  const immediateReq = currentStatus.requiredMaterial;
  const immediateLabel = currentStatus.requiredLabel || getMatLabel(immediateReq);

  const immediateStatus = checkMaterialUnlockStatus(
    immediateReq,
    allMaterials,
    allCategories,
    completedMaterialIds,
    authSession,
    studentScores,
    minQuizScoreToUnlock
  );

  if (immediateStatus.isUnlocked) {
    return {
      immediateRequiredMaterial: immediateReq,
      immediateRequiredLabel: immediateLabel,
      isImmediateRequiredUnlocked: true,
      activeAvailableMaterial: immediateReq,
      activeAvailableLabel: immediateLabel,
      reason: currentStatus.reason,
      minQuizScore: currentStatus.minQuizScore,
      currentScore: currentStatus.currentScore,
      totalQuestions: currentStatus.totalQuestions,
    };
  }

  // Immediate required material is ALSO locked. Trace backward to find the earliest active unlocked material
  let currMat: Material = immediateReq;
  const visited = new Set<string>([material.id, immediateReq.id]);
  let activeMat: Material = sameCatPublishedMats[0] || immediateReq;

  while (currMat) {
    const status = checkMaterialUnlockStatus(
      currMat,
      allMaterials,
      allCategories,
      completedMaterialIds,
      authSession,
      studentScores,
      minQuizScoreToUnlock
    );
    if (status.isUnlocked) {
      activeMat = currMat;
      break;
    }
    if (!status.requiredMaterial || visited.has(status.requiredMaterial.id)) {
      activeMat = sameCatPublishedMats[0] || currMat;
      break;
    }
    visited.add(status.requiredMaterial.id);
    currMat = status.requiredMaterial;
  }

  const activeLabel = getMatLabel(activeMat);

  return {
    immediateRequiredMaterial: immediateReq,
    immediateRequiredLabel: immediateLabel,
    isImmediateRequiredUnlocked: false,
    activeAvailableMaterial: activeMat,
    activeAvailableLabel: activeLabel,
    reason: currentStatus.reason,
    explanation: `${immediateLabel} saat ini masih terkunci karena kamu harus menyelesaikan ${activeLabel} terlebih dahulu.`,
    minQuizScore: currentStatus.minQuizScore,
    currentScore: currentStatus.currentScore,
    totalQuestions: currentStatus.totalQuestions,
  };
}

