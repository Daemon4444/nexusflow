{{- define "nexusflow.labels" -}}
app.kubernetes.io/name: nexusflow
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "nexusflow.image" -}}
{{- printf "%s@%s" (required "image repository is required" .repository) (required "image digest is required" .digest) -}}
{{- end }}
