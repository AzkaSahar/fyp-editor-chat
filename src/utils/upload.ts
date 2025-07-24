export const uploadDocument = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("http://localhost:8000/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) throw new Error("Upload failed");

  const data = await response.json();
  return data.html; // ✅ Instead of data.text
};
