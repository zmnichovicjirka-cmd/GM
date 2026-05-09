
/**
 * Cloudinary Client-side Service
 * NOTE: For security, use "Unsigned Uploads" with an Upload Preset.
 * If you must use the API Secret, it's NOT recommended for production on client-side.
 */

// --- KONFIGURACE ---
let globalCloudName = "dg067s3nz";
let globalUploadPreset = "gymni_mate_unsigned";
let globalApiKey = "";
let globalApiSecret = "";

export const setCloudinaryConfig = (cloudName?: string, uploadPreset?: string, apiKey?: string, apiSecret?: string) => {
  if (cloudName) globalCloudName = cloudName;
  if (uploadPreset) globalUploadPreset = uploadPreset;
  if (apiKey) globalApiKey = apiKey;
  if (apiSecret) globalApiSecret = apiSecret;
};

/**
 * Generates a SHA-1 signature for Cloudinary signed uploads
 */
async function generateSignature(params: Record<string, string>, apiSecret: string): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  const signatureString = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join("&") + apiSecret;

  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export const uploadToCloudinary = async (data: string, fileName?: string): Promise<string> => {
  if (!data || !data.startsWith('data:')) return data;

  try {
    const formData = new FormData();
    formData.append("file", data);

    // If we have API Key and Secret, we do a SIGNED upload
    // CRITICAL: We only do signed upload if the Cloud Name is NOT the default one 
    // OR if the user explicitly provided an API key they intend to use.
    // If the key is "Unknown", it's usually because it's mismatched with the cloud name.
    const isUsingCustomCloud = globalCloudName !== "dg067s3nz";
    const hasFullCredentials = !!(globalApiKey && globalApiSecret);

    if (hasFullCredentials) {
      const timestamp = Math.round(new Date().getTime() / 1000).toString();
      const params: Record<string, string> = { timestamp };
      
      if (fileName) {
        params.public_id = fileName.replace(/[^a-zA-Z0-9]/g, '_');
      }

      const signature = await generateSignature(params, globalApiSecret);

      formData.append("api_key", globalApiKey);
      formData.append("timestamp", timestamp);
      formData.append("signature", signature);
      if (params.public_id) formData.append("public_id", params.public_id);
      
      // Some consoles require upload_preset even for signed uploads if specifically configured
      if (globalUploadPreset && globalUploadPreset !== "gymni_mate_unsigned") {
        formData.append("upload_preset", globalUploadPreset);
      }
    } else {
      // Fallback to UNSIGNED upload with preset
      formData.append("upload_preset", globalUploadPreset);
      if (fileName) {
        formData.append("public_id", fileName.replace(/[^a-zA-Z0-9]/g, '_'));
      }
    }

    const response = await fetch(`https://api.cloudinary.com/v1_1/${globalCloudName}/auto/upload`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "Cloudinary upload failed");
    }

    const result = await response.json();
    return result.secure_url;
  } catch (error) {
    console.error("Cloudinary Client Upload Error:", error);
    return data; // Fallback to base64
  }
};
