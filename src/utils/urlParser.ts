import { MaterialType, Material } from '../types';

export interface ParsedUrlResult {
  embedUrl: string;
  type: MaterialType;
  isValid: boolean;
  message?: string;
}

/**
 * Checks if a given URL points to a Google Form (docs.google.com/forms or forms.gle)
 */
export function isGoogleFormUrl(inputUrl?: string | null): boolean {
  if (!inputUrl || typeof inputUrl !== 'string') return false;
  const cleanUrl = inputUrl.trim().toLowerCase();
  return (
    cleanUrl.includes('docs.google.com/forms') ||
    cleanUrl.includes('forms.gle') ||
    cleanUrl.includes('google.com/forms')
  );
}

/**
 * Checks if a material is a Google Form based on type, originalUrl, or embedUrl
 */
export function isMaterialGoogleForm(material?: Partial<Material> | null): boolean {
  if (!material) return false;
  if (material.type === 'gform') return true;
  if (isGoogleFormUrl(material.originalUrl)) return true;
  if (isGoogleFormUrl(material.embedUrl)) return true;
  return false;
}

export function parseEmbedUrl(inputUrl: string): ParsedUrlResult {
  if (!inputUrl || typeof inputUrl !== 'string') {
    return { embedUrl: '', type: 'other', isValid: false, message: 'URL tidak boleh kosong' };
  }

  let cleanUrl = inputUrl.trim();

  // If user pasted an iframe HTML snippet like <iframe src="..."></iframe>
  const iframeMatch = cleanUrl.match(/src=["']([^"']+)["']/i);
  if (iframeMatch && iframeMatch[1]) {
    cleanUrl = iframeMatch[1];
  }

  // 0. Google Form URL Handling (Sumatif / Tes)
  if (cleanUrl.includes('docs.google.com/forms') || cleanUrl.includes('forms.gle')) {
    let embedUrl = cleanUrl;
    
    // Replace /edit or /responses with /viewform
    if (embedUrl.includes('/edit')) {
      embedUrl = embedUrl.replace(/\/edit(\?.*)?$/, '/viewform');
    } else if (embedUrl.includes('/responses')) {
      embedUrl = embedUrl.replace(/\/responses(\?.*)?$/, '/viewform');
    }

    // Ensure embedded=true parameter
    if (!embedUrl.includes('embedded=true')) {
      if (embedUrl.includes('?')) {
        embedUrl = `${embedUrl}&embedded=true`;
      } else {
        embedUrl = `${embedUrl}?embedded=true`;
      }
    }

    return {
      embedUrl,
      type: 'gform',
      isValid: true,
      message: 'Berhasil mengonversi Tes Google Form (Sumatif)',
    };
  }

  // 1. YouTube Video URL Handling
  if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
    let videoId = '';
    const watchMatch = cleanUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    const shortMatch = cleanUrl.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    const embedMatch = cleanUrl.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    const shortsMatch = cleanUrl.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);

    if (watchMatch && watchMatch[1]) videoId = watchMatch[1];
    else if (shortMatch && shortMatch[1]) videoId = shortMatch[1];
    else if (embedMatch && embedMatch[1]) videoId = embedMatch[1];
    else if (shortsMatch && shortsMatch[1]) videoId = shortsMatch[1];

    if (videoId) {
      const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0`;
      return {
        embedUrl,
        type: 'youtube',
        isValid: true,
        message: 'Berhasil mengonversi Video YouTube',
      };
    }
  }

  // 2. Canva Presentation URL Handling
  if (cleanUrl.includes('canva.com')) {
    let embedUrl = cleanUrl;

    // Check if it already has ?embed
    if (!embedUrl.includes('?embed') && !embedUrl.includes('&embed')) {
      // Remove query parameters or trailing slashes, replace /view or /watch with /view?embed
      if (embedUrl.includes('/view')) {
        embedUrl = embedUrl.replace(/\/view(\?.*)?$/, '/view?embed');
      } else if (embedUrl.includes('/watch')) {
        embedUrl = embedUrl.replace(/\/watch(\?.*)?$/, '/view?embed');
      } else {
        embedUrl = embedUrl.split('?')[0] + '?embed';
      }
    }

    return {
      embedUrl,
      type: 'canva',
      isValid: true,
      message: 'Berhasil mengonversi URL Presentasi Canva',
    };
  }

  // 2. Google Slides Presentation
  if (cleanUrl.includes('docs.google.com/presentation')) {
    const slideIdMatch = cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (slideIdMatch && slideIdMatch[1]) {
      const slideId = slideIdMatch[1];
      const embedUrl = `https://docs.google.com/presentation/d/${slideId}/embed?start=false&loop=false&delayms=3000`;
      return {
        embedUrl,
        type: 'gdrive',
        isValid: true,
        message: 'Berhasil mengonversi Google Slides Presentation',
      };
    }
  }

  // 3. Google Docs Document
  if (cleanUrl.includes('docs.google.com/document')) {
    const docIdMatch = cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (docIdMatch && docIdMatch[1]) {
      const docId = docIdMatch[1];
      const embedUrl = `https://docs.google.com/document/d/${docId}/preview`;
      return {
        embedUrl,
        type: 'gdrive',
        isValid: true,
        message: 'Berhasil mengonversi Google Document',
      };
    }
  }

  // 4. Google Sheets
  if (cleanUrl.includes('docs.google.com/spreadsheets')) {
    const sheetIdMatch = cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (sheetIdMatch && sheetIdMatch[1]) {
      const sheetId = sheetIdMatch[1];
      const embedUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/pubhtml?widget=true&headers=false`;
      return {
        embedUrl,
        type: 'gdrive',
        isValid: true,
        message: 'Berhasil mengonversi Google Spreadsheet',
      };
    }
  }

  // 5. Google Drive File (PDF, Video, Docs, etc.)
  if (cleanUrl.includes('drive.google.com')) {
    const fileIdMatch = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || cleanUrl.match(/id=([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      const fileId = fileIdMatch[1];
      const embedUrl = `https://drive.google.com/file/d/${fileId}/preview`;
      return {
        embedUrl,
        type: 'gdrive',
        isValid: true,
        message: 'Berhasil mengonversi Google Drive File Viewer',
      };
    }

    // Google Drive Folder
    const folderMatch = cleanUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch && folderMatch[1]) {
      const folderId = folderMatch[1];
      const embedUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}#grid`;
      return {
        embedUrl,
        type: 'gdrive',
        isValid: true,
        message: 'Berhasil mengonversi Google Drive Folder',
      };
    }
  }

  const isPdf = cleanUrl.toLowerCase().endsWith('.pdf');
  return {
    embedUrl: cleanUrl,
    type: isPdf ? 'pdf' : 'other',
    isValid: cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'),
    message: cleanUrl.startsWith('http') ? 'Menggunakan URL langsung' : 'Format URL tidak valid',
  };
}

// Parse Logo URL (Direct URL or Google Drive link)
export function parseLogoUrl(inputUrl: string): string {
  if (!inputUrl || typeof inputUrl !== 'string') return '';
  let cleanUrl = inputUrl.trim();
  if (!cleanUrl) return '';

  // Handle Google Drive file links
  if (cleanUrl.includes('drive.google.com') || cleanUrl.includes('docs.google.com')) {
    const fileIdMatch =
      cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
      cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
      cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);

    if (fileIdMatch && fileIdMatch[1]) {
      const fileId = fileIdMatch[1];
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`;
    }
  }

  return cleanUrl;
}

