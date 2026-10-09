import {
  checklistItemParamsSchema,
  checklistParamsSchema,
  listChecklistsQuerySchema,
  setChecklistClosedSchema,
  setChecklistItemSchema,
  type ChecklistDetail,
  type ChecklistList,
} from '@accessdesk/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { IdentityProviderFactory } from '../../infra/identity';
import { requireAuth } from '../../plugins/auth';
import type { ChecklistRepository } from './checklists.repository';
import { ChecklistsService } from './checklists.service';

export interface ChecklistRouteDeps {
  identityFor: IdentityProviderFactory;
  checklists: ChecklistRepository;
  clock: () => Date;
}

export function checklistRoutes(app: FastifyInstance, deps: ChecklistRouteDeps): void {
  const serviceFor = (request: FastifyRequest) =>
    new ChecklistsService({
      checklists: deps.checklists,
      identity: deps.identityFor(requireAuth(request).token),
      clock: deps.clock,
    });

  void app.register(async (scope) => {
    scope.addHook('onSend', async (_request, reply) => {
      reply.header('cache-control', 'no-store');
    });

    scope.get('/checklists', async (request): Promise<ChecklistList> => {
      return serviceFor(request).list(listChecklistsQuerySchema.parse(request.query));
    });

    scope.get('/checklists/:subjectId', async (request): Promise<ChecklistDetail> => {
      const { subjectId } = checklistParamsSchema.parse(request.params);
      return serviceFor(request).get(subjectId);
    });

    scope.patch('/checklists/:subjectId', async (request): Promise<ChecklistDetail> => {
      const { subjectId } = checklistParamsSchema.parse(request.params);
      const { closed } = setChecklistClosedSchema.parse(request.body);
      const auth = requireAuth(request);
      return serviceFor(request).setClosed(subjectId, closed, {
        actorId: auth.sub,
        requestId: request.id,
      });
    });

    scope.patch(
      '/checklists/:subjectId/items/:itemId',
      async (request): Promise<ChecklistDetail> => {
        const { subjectId, itemId } = checklistItemParamsSchema.parse(request.params);
        const { done } = setChecklistItemSchema.parse(request.body);
        const auth = requireAuth(request);
        return serviceFor(request).setItem(subjectId, itemId, done, {
          actorId: auth.sub,
          requestId: request.id,
        });
      },
    );
  });
}
