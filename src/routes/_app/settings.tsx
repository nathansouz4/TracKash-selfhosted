import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { HardDrive, Landmark } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/dashboard";
import { Note } from "@/components/setup/parts";
import {
  PluggyCredentialsForm,
  PluggyCredentialsInstructions,
} from "@/components/setup/PluggyForms";
import { Badge } from "@/components/ui/badge";
import { settingsQuery, updatePluggySettings } from "@/functions/settings.functions";

export const Route = createFileRoute("/_app/settings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery),
  component: SettingsPage,
});

function SettingsPage() {
  const { data } = useSuspenseQuery(settingsQuery);
  const queryClient = useQueryClient();
  const pluggyFn = useServerFn(updatePluggySettings);

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Credenciais da Pluggy e onde ficam os seus dados. Uma credencial nova é testada antes de ser salva, e esta tela nunca mostra os valores."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          icon={Landmark}
          title="Pluggy"
          actions={
            <Badge variant={data.pluggy ? "secondary" : "outline"}>
              {data.pluggy ? "Configurado" : "Não configurado"}
            </Badge>
          }
          bodyClassName="space-y-5 p-5"
        >
          <PluggyCredentialsInstructions />
          <PluggyCredentialsForm
            configured={data.pluggy}
            submit={(input) => pluggyFn({ data: input })}
            onSaved={async () => {
              toast.success("Credenciais da Pluggy atualizadas.");
              await queryClient.invalidateQueries({ queryKey: settingsQuery.queryKey });
            }}
          />
        </SectionCard>

        <SectionCard icon={HardDrive} title="Dados locais" bodyClassName="space-y-4 p-5 text-sm">
          <p className="text-muted-foreground">
            Tudo o que o Trackash sabe (transações, investimentos, extratos da B3 e as credenciais
            acima) fica neste arquivo SQLite, legível só pelo seu usuário:
          </p>
          <p className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs break-all">
            {data.databasePath}
          </p>
          <Note>
            Para fazer backup, copie o arquivo com o app fechado. Para recomeçar do zero, feche o
            app e apague o arquivo: na próxima abertura a configuração inicial volta.
          </Note>
        </SectionCard>
      </div>
    </>
  );
}
