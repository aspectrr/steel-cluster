{{/*
Common template helpers for steel-cluster
*/}}

{{/* Expand the name of the chart. */}}
{{- define "steel-cluster.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Create a default fully qualified app name. Truncated at 63 chars. */}}
{{- define "steel-cluster.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Chart label helper (helm.sh/chart) */}}
{{- define "steel-cluster.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{/* Target namespace: prefer values.namespace.name, else .Release.Namespace */}}
{{- define "steel-cluster.namespace" -}}
{{- if .Values.namespace.name -}}
{{- .Values.namespace.name -}}
{{- else -}}
{{- .Release.Namespace -}}
{{- end -}}
{{- end -}}

{{/* Common selector labels used by selectors */}}
{{- define "steel-cluster.selectorLabels" -}}
app.kubernetes.io/name: {{ include "steel-cluster.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Standard labels with optional global.commonLabels merged */}}
{{- define "steel-cluster.labels" -}}
app.kubernetes.io/name: {{ include "steel-cluster.name" . }}
helm.sh/chart: {{ include "steel-cluster.chart" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.global.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/* Standard annotations with optional global.commonAnnotations merged */}}
{{- define "steel-cluster.annotations" -}}
{{- with .Values.global.commonAnnotations }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/* Render imagePullSecrets from global.imagePullSecrets if defined */}}
{{- define "steel-cluster.imagePullSecrets" -}}
{{- if .Values.global.imagePullSecrets }}
imagePullSecrets:
{{- toYaml .Values.global.imagePullSecrets | nindent 2 }}
{{- end }}
{{- end -}}

{{/* Generic image reference builder: include with dict "repository" "tag" */}}
{{- define "steel-cluster.image" -}}
{{- $repository := .repository -}}
{{- $tag := default "latest" .tag -}}
{{- printf "%s:%s" $repository $tag -}}
{{- end -}}

{{/* Orchestrator ServiceAccount name helper */}}
{{- define "steel-cluster.orchestrator.serviceAccountName" -}}
{{- if .Values.orchestrator.serviceAccount.create -}}
{{- default "browser-orchestrator" .Values.orchestrator.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.orchestrator.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* Prometheus ServiceAccount name helper */}}
{{- define "steel-cluster.prometheus.serviceAccountName" -}}
{{- if .Values.prometheus.serviceAccount.create -}}
{{- default "prometheus" .Values.prometheus.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.prometheus.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* Resolve the Kubernetes namespace value used by app logic (env K8S_NAMESPACE) */}}
{{- define "steel-cluster.k8sNamespace" -}}
{{- if .Values.orchestrator.env.K8S_NAMESPACE -}}
{{- .Values.orchestrator.env.K8S_NAMESPACE -}}
{{- else -}}
{{- include "steel-cluster.namespace" . -}}
{{- end -}}
{{- end -}}

{{/* Helper to render templated values or YAML blocks safely */}}
{{- define "steel-cluster.tplvalues.render" -}}
{{- $value := index . 0 -}}
{{- $context := index . 1 -}}
{{- if kindIs "string" $value -}}
{{- tpl $value $context -}}
{{- else -}}
{{- toYaml $value -}}
{{- end -}}
{{- end -}}
