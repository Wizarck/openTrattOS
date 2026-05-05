import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AiSuggestion } from '../domain/ai-suggestion.entity';
import { AiSuggestionsController } from './ai-suggestions.controller';
import {
  AiSuggestionAlreadyActedError,
  AiSuggestionNotFoundError,
  AiSuggestionRejectReasonError,
  AiSuggestionTweakValueError,
} from '../application/errors';
import {
  AcceptSuggestionDto,
  RejectSuggestionDto,
  SuggestWasteDto,
  SuggestYieldDto,
} from './dto/ai-suggestion.dto';

const ORG = '11111111-1111-4111-8111-111111111111';
const ING = '22222222-2222-4222-8222-222222222222';
const REC = '33333333-3333-4333-8333-333333333333';
const SUG = '44444444-4444-4444-8444-444444444444';

function makeSuggestion(): AiSuggestion {
  return AiSuggestion.create({
    organizationId: ORG,
    kind: 'yield',
    targetIngredientId: ING,
    targetRecipeId: null,
    contextHash: 'ctx',
    suggestedValue: 0.85,
    citationUrl: 'https://example.com',
    snippet: 'snippet',
    modelName: 'gpt-oss-20b-rag',
    modelVersion: '1.0',
  });
}

function buildController(opts: {
  enabled?: boolean;
  serviceOverrides?: Partial<{
    suggestYield: jest.Mock;
    suggestWaste: jest.Mock;
    acceptSuggestion: jest.Mock;
    rejectSuggestion: jest.Mock;
  }>;
} = {}) {
  const service = {
    suggestYield: jest.fn().mockResolvedValue(makeSuggestion()),
    suggestWaste: jest.fn().mockResolvedValue(makeSuggestion()),
    acceptSuggestion: jest.fn().mockResolvedValue(makeSuggestion()),
    rejectSuggestion: jest.fn().mockResolvedValue(makeSuggestion()),
    ...opts.serviceOverrides,
  };
  return {
    controller: new AiSuggestionsController(service as never, opts.enabled ?? true),
    service,
  };
}

function yieldDto(): SuggestYieldDto {
  const dto = new SuggestYieldDto();
  dto.organizationId = ORG;
  dto.ingredientId = ING;
  dto.contextHash = 'ctx';
  return dto;
}

function wasteDto(): SuggestWasteDto {
  const dto = new SuggestWasteDto();
  dto.organizationId = ORG;
  dto.recipeId = REC;
  dto.contextHash = 'ctx';
  return dto;
}

function acceptDto(value?: number): AcceptSuggestionDto {
  const dto = new AcceptSuggestionDto();
  dto.organizationId = ORG;
  dto.value = value;
  return dto;
}

function rejectDto(reason: string): RejectSuggestionDto {
  const dto = new RejectSuggestionDto();
  dto.organizationId = ORG;
  dto.reason = reason;
  return dto;
}

describe('AiSuggestionsController — feature flag', () => {
  it('returns 404 on every endpoint when disabled', async () => {
    const { controller } = buildController({ enabled: false });
    await expect(controller.suggestYield(yieldDto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.suggestWaste(wasteDto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.accept(SUG, acceptDto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      controller.reject(SUG, rejectDto('a sufficiently long reason')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AiSuggestionsController — POST /yield', () => {
  it('returns wrapped suggestion on success', async () => {
    const { controller } = buildController();
    const result = await controller.suggestYield(yieldDto());
    expect(result.suggestion).not.toBeNull();
    expect(result.suggestion!.kind).toBe('yield');
    expect(result.suggestion!.citationUrl).toBe('https://example.com');
    expect(result.reason).toBeUndefined();
  });

  it('returns { suggestion: null, reason: "no_citation_available" } when service returns null', async () => {
    const { controller } = buildController({
      serviceOverrides: { suggestYield: jest.fn().mockResolvedValue(null) },
    });
    const result = await controller.suggestYield(yieldDto());
    expect(result.suggestion).toBeNull();
    expect(result.reason).toBe('no_citation_available');
  });
});

describe('AiSuggestionsController — POST /waste', () => {
  it('returns wrapped suggestion on success', async () => {
    const { controller } = buildController();
    const result = await controller.suggestWaste(wasteDto());
    expect(result.suggestion).not.toBeNull();
  });

  it('returns null wrapper when no result', async () => {
    const { controller } = buildController({
      serviceOverrides: { suggestWaste: jest.fn().mockResolvedValue(null) },
    });
    const result = await controller.suggestWaste(wasteDto());
    expect(result.suggestion).toBeNull();
    expect(result.reason).toBe('no_citation_available');
  });
});

describe('AiSuggestionsController — POST /:id/accept', () => {
  it('returns updated DTO on accept (no tweak)', async () => {
    const { controller, service } = buildController();
    const result = await controller.accept(SUG, acceptDto());
    expect(result.id).toBeTruthy();
    expect(service.acceptSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        suggestionId: SUG,
        valueOverride: undefined,
      }),
    );
  });

  it('forwards tweak value to service', async () => {
    const { controller, service } = buildController();
    await controller.accept(SUG, acceptDto(0.7));
    expect(service.acceptSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ valueOverride: 0.7 }),
    );
  });

  it('translates AiSuggestionNotFoundError to 404', async () => {
    const { controller } = buildController({
      serviceOverrides: {
        acceptSuggestion: jest.fn().mockRejectedValue(new AiSuggestionNotFoundError(SUG)),
      },
    });
    await expect(controller.accept(SUG, acceptDto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('translates AiSuggestionAlreadyActedError to 409', async () => {
    const { controller } = buildController({
      serviceOverrides: {
        acceptSuggestion: jest
          .fn()
          .mockRejectedValue(new AiSuggestionAlreadyActedError(SUG, 'rejected')),
      },
    });
    await expect(controller.accept(SUG, acceptDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('translates AiSuggestionTweakValueError to 422', async () => {
    const { controller } = buildController({
      serviceOverrides: {
        acceptSuggestion: jest.fn().mockRejectedValue(new AiSuggestionTweakValueError()),
      },
    });
    await expect(controller.accept(SUG, acceptDto(1.5))).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

describe('AiSuggestionsController — POST /:id/reject', () => {
  it('returns updated DTO on reject', async () => {
    const { controller, service } = buildController();
    await controller.reject(SUG, rejectDto('this is a sufficiently long reason'));
    expect(service.rejectSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'this is a sufficiently long reason' }),
    );
  });

  it('translates AiSuggestionRejectReasonError to 422', async () => {
    const { controller } = buildController({
      serviceOverrides: {
        rejectSuggestion: jest
          .fn()
          .mockRejectedValue(new AiSuggestionRejectReasonError(10)),
      },
    });
    await expect(controller.reject(SUG, rejectDto('short'))).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('translates AiSuggestionAlreadyActedError to 409', async () => {
    const { controller } = buildController({
      serviceOverrides: {
        rejectSuggestion: jest
          .fn()
          .mockRejectedValue(new AiSuggestionAlreadyActedError(SUG, 'accepted')),
      },
    });
    await expect(
      controller.reject(SUG, rejectDto('a sufficiently long reason')),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
