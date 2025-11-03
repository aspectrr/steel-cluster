import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UseFormReturn } from "react-hook-form";
import { z } from "zod";

import { sessionFormSchema } from "./create-session-dialog";

interface AdvancedSessionSettingsProps {
  form: UseFormReturn<z.infer<typeof sessionFormSchema>>;
}

export const AdvancedSessionSettings = ({ form }: AdvancedSessionSettingsProps) => {
  return (
    <div className="space-y-5">
      {/* User Agent */}
      <FormField
        control={form.control}
        name="userAgent"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-[var(--sand-12)]">Custom User Agent (Optional)</FormLabel>
            <FormControl>
              <Input
                className="bg-[var(--sand-a2)] text-[var(--sand-12)]"
                placeholder="e.g., Mozilla/5.0..."
                {...field}
              />
            </FormControl>
            <FormDescription>Specify a custom User-Agent string.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Use Proxy Checkbox */}
      <FormField
        control={form.control}
        name="useProxy"
        render={({ field }) => (
          <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow bg-[var(--sand-a2)]">
            <FormControl>
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
                className="border-[var(--sand-6)] data-[state=checked]:bg-[var(--indigo-9)] data-[state=checked]:text-[var(--sand-1)]"
              />
            </FormControl>
            <div className="space-y-1 leading-none">
              <FormLabel className="text-[var(--sand-12)]">Use Proxy</FormLabel>
              <FormDescription>Route session traffic through a proxy server.</FormDescription>
            </div>
          </FormItem>
        )}
      />

      {/* Proxy URL */}
      <FormField
        control={form.control}
        name="proxyUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-[var(--sand-12)]">Proxy URL</FormLabel>
            <FormControl>
              <Input
                className="bg-[var(--sand-a2)] text-[var(--sand-12)]"
                placeholder="e.g., https://user:pass@host:port"
                {...field}
              />
            </FormControl>
            <FormDescription>The full URL of the proxy server.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Other Checkboxes Grouped */}
      <div className="space-y-4 rounded-md border p-4 shadow bg-[var(--sand-a2)]">
        <Label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-[var(--sand-12)] mb-2 block">
          Other Session Options
        </Label>
        {/* Solve Captcha */}
        <FormField
          control={form.control}
          name="solveCaptcha"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="border-[var(--sand-6)] data-[state=checked]:bg-[var(--indigo-9)] data-[state=checked]:text-[var(--sand-1)]"
                />
              </FormControl>
              <FormLabel className="font-normal text-[var(--sand-11)]">
                Enable Automatic Captcha Solving
              </FormLabel>
            </FormItem>
          )}
        />
        {/* Is Selenium */}
        <FormField
          control={form.control}
          name="isSelenium"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center space-x-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="border-[var(--sand-6)] data-[state=checked]:bg-[var(--indigo-9)] data-[state=checked]:text-[var(--sand-1)]"
                />
              </FormControl>
              <FormLabel className="font-normal text-[var(--sand-11)]">
                Enable Selenium Mode
              </FormLabel>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
};
