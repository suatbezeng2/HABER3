
export const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
export const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

// Use environment variables for table names, with defaults matching the new provided ones.
// These names will be used by the Metadata API to create tables if they don't exist.
export const AIRTABLE_SITES_TABLE_NAME = process.env.NEXT_PUBLIC_AIRTABLE_SITES_TABLE_NAME || 'Sites';
export const AIRTABLE_ARTICLES_TABLE_NAME = process.env.NEXT_PUBLIC_AIRTABLE_ARTICLES_TABLE_NAME || 'Articles';


// Initial check for essential keys can be done here or more robustly in the airtable.ts initialization.
// For now, warnings are helpful during development if these are not set.
if (typeof window === 'undefined') { // Only log warnings on the server-side
  if (!AIRTABLE_API_KEY) {
    console.warn("AIRTABLE_API_KEY environment variable is not set. Airtable functionality will be disabled if it's required for an operation.");
  }
  
  if (!AIRTABLE_BASE_ID) {
    console.warn("AIRTABLE_BASE_ID environment variable is not set. Airtable functionality will be disabled if it's required for an operation.");
  }
}
