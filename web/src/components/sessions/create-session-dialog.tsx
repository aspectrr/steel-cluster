import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useSessionsContext } from "@/hooks/use-sessions-context";
import { AdvancedSessionSettings } from "./advanced-session-settings";

// Export the schema so it can be imported by the AdvancedSessionSettings component
export const sessionFormSchema = z.object({
  sessionId: z.string().uuid().optional().describe("Optional custom uuid for session"),
  userAgent: z.string().optional().describe("Custom user agent string for the browser session"),
  useProxy: z
    .boolean()
    .optional()
    .default(false)
    .describe("Flag to enable proxy usage for the browser session"),
  proxyUrl: z.string().url().optional().describe("Custom proxy url to use for the browser session"),
  solveCaptcha: z
    .boolean()
    .optional()
    .default(false)
    .describe("Flag to enable automatic captcha solving"),
  sessionContext: z
    .object({
      cookies: z.array(z.record(z.any())).optional(),
      localStorage: z.array(z.record(z.any())).optional(),
    })
    .optional()
    .describe("Custom session context data to be used in the created session"),
  timeout: z
    .number()
    .int()
    .positive()
    .default(300000)
    .describe("How long after starting should the session timeout (in milliseconds)"),
  concurrency: z
    .number()
    .int()
    .optional()
    .describe("Number of sessions to create concurrently (max: 50)"),
  isSelenium: z
    .boolean()
    .optional()
    .default(false)
    .describe("Flag to enable selenium mode for the browser session (default: false)"),
});

export const CreateSessionDialog = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { useCreateSessionMutation } = useSessionsContext();

  const form = useForm<z.infer<typeof sessionFormSchema>>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      timeout: 300000,
      useProxy: false,
      solveCaptcha: false,
      isSelenium: false,
      userAgent: "",
      proxyUrl: undefined,
    },
  });

  const { mutate: createSession, isLoading, isSuccess, error } = useCreateSessionMutation();

  // Log any mutation errors for debugging
  useEffect(() => {
    if (error) {
      console.error("Session creation error:", error);
    }
  }, [error]);

  useEffect(() => {
    if (isSuccess) {
      form.reset();
      setOpen(false);
    }
  }, [isSuccess, form]);

  function onSubmit(values: z.infer<typeof sessionFormSchema>) {
    try {
      const submissionValues = {
        ...values,
        proxyUrl: values.proxyUrl || undefined,
        userAgent: values.userAgent || undefined,
        sessionContext: undefined,
        // Ensure timeout is a number
        timeout: typeof values.timeout === "number" ? values.timeout : 300000,
      };

      createSession(submissionValues);
    } catch (err) {
      console.error("An unexpected error occurred while submitting the form: ", err);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto bg-[var(--sand-1)] border-[var(--sand-3)] text-[var(--sand-12)]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Start a new Session</DialogTitle>
              <DialogDescription>Configure options and start a new session.</DialogDescription>
            </DialogHeader>

            <FormField
              control={form.control}
              name="timeout"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[var(--sand-12)]">Session Timeout (ms)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      className="bg-[var(--sand-a2)] text-[var(--sand-12)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="300000"
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value === "" ? 300000 : Number(e.target.value))
                      }
                      value={field.value ?? 300000}
                    />
                  </FormControl>
                  <FormDescription>
                    Session closes automatically after this time (default: 5 minutes).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Advanced Settings Toggle Button */}
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center justify-between bg-[var(--sand-a2)] text-[var(--sand-12)]"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span>Advanced Settings</span>
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Button>

            {/* Advanced Settings Section */}
            {showAdvanced && <AdvancedSessionSettings form={form} />}

            <DialogFooter>
              {!isLoading && (
                <Button
                  variant="destructive"
                  className="text-[var(--sand-12)] bg-[var(--sand-3)] hover:bg-[var(--sand-4)]"
                  type="button"
                  onClick={() => {
                    form.reset();
                    setOpen(false);
                  }}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-[var(--indigo-9)] text-[var(--sand-12)] hover:bg-[var(--indigo-10)]"
              >
                {isLoading ? "Starting Session..." : "Start Session"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
