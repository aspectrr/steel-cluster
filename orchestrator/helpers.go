package main

import (
	"fmt"
	"math/rand"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	intstr "k8s.io/apimachinery/pkg/util/intstr"
)

func init() {
	// Seed for generateShortID
}

// generateShortID returns an 8-char lowercase alphanumeric ID suitable for pod names.
func generateShortID() string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 8)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

func intstrFromInt(n int) intstr.IntOrString {
	return intstr.FromInt(n)
}

func mustParseResources(memory, cpu string) corev1.ResourceList {
	list := corev1.ResourceList{}
	if memory != "" {
		q, err := resource.ParseQuantity(memory)
		if err != nil {
			panic(fmt.Sprintf("invalid memory quantity %q: %v", memory, err))
		}
		list[corev1.ResourceMemory] = q
	}
	if cpu != "" {
		q, err := resource.ParseQuantity(cpu)
		if err != nil {
			panic(fmt.Sprintf("invalid cpu quantity %q: %v", cpu, err))
		}
		list[corev1.ResourceCPU] = q
	}
	return list
}
