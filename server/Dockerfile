FROM ghcr.io/imputnet/cobalt:11

# Render assigns the public hostname and listening port at runtime.
CMD ["sh", "-ec", "export API_URL=\"${RENDER_EXTERNAL_URL:?Missing Render URL}/\" API_PORT=\"${PORT:-10000}\"; exec node src/cobalt"]
